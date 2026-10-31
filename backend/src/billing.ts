import type { FastifyInstance } from 'fastify';
import {
  APPWRITE_COLLECTIONS,
  listScopedRecords,
  putRecord,
  getRecord,
} from './appwrite.js';
import { resolveProfileId } from './profiles.js';
import type { Fee } from './schemas.js';
import { scopedEntityId } from './tenant.js';

const FEES = APPWRITE_COLLECTIONS.fees;

// Appwrite has no transactions. Serializing fee creation in one shared queue
// keeps simultaneous creates (REST + auto-generation) from reading the same
// max id and overwriting each other.
let createQueue: Promise<unknown> = Promise.resolve();

export function withFeeCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = createQueue.then(fn, fn);
  createQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function todayIso(): string {
  // Compare due dates in IST (the app's operating timezone): UTC 18:30+ fires
  // on the next local day, so shift by +5:30 before taking the calendar date.
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function nextDueDate(dueDate: string): string {
  const parsed = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dueDate;
  const day = parsed.getUTCDate();
  const next = new Date(parsed);
  next.setUTCMonth(next.getUTCMonth() + 1);
  // Clamp to the last day of the target month so due dates like the 31st do
  // not jump into the month after next.
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

async function allocateNextFeeId(profileId: string): Promise<number> {
  const records = await listScopedRecords<Fee>(FEES, profileId);
  return (
    records.reduce(
      (max, record) => Math.max(max, Number(record.data.id) || 0),
      0
    ) + 1
  );
}

/**
 * Mark every `pending` fee whose due date has passed as `overdue`.
 * Returns the number of fees updated. Idempotent: already-paid/overdue fees
 * are never touched.
 */
export async function markOverdueFees(profileId: string): Promise<number> {
  const records = await listScopedRecords<Fee>(FEES, profileId);
  const today = todayIso();
  let updated = 0;
  for (const record of records) {
    const fee = record.data;
    if (fee.status !== 'pending') continue;
    if (!fee.due_date || String(fee.due_date) >= today) continue;
    await putRecord<Fee>(FEES, scopedEntityId(profileId, record.entityId), {
      ...fee,
      status: 'overdue',
    });
    updated++;
  }
  return updated;
}

const MONTHLY_STATUS = new Set(['paid', 'overdue']);

/**
 * Generate the next month's pending bill by cloning a settled monthly fee.
 * Skips when the workspace already has a pending/overdue bill for the same
 * student in the following period — idempotent across webhook retries and
 * repeated cron runs.
 */
export async function generateNextMonthBill(
  profileId: string,
  fee: Fee,
  source: 'settlement' | 'cron' | 'manual' = 'settlement'
): Promise<Fee | null> {
  if (!fee.due_date || !MONTHLY_STATUS.has(fee.status)) return null;

  const nextDue = nextDueDate(fee.due_date);
  const records = await listScopedRecords<Fee>(FEES, profileId);
  const alreadyBilled = records.some((record) => {
    const other = record.data;
    return (
      other.student_name.toLowerCase() === fee.student_name.toLowerCase() &&
      Number(other.amount) === Number(fee.amount) &&
      other.status !== 'paid' &&
      other.due_date === nextDue
    );
  });
  if (alreadyBilled) return null;

  const created = await withFeeCreateLock(async () => {
    const id = await allocateNextFeeId(profileId);
    const nextFee: Fee = {
      id,
      student_name: fee.student_name,
      amount: fee.amount,
      status: 'pending',
      due_date: nextDue,
      created_at: new Date().toISOString(),
    };
    await putRecord(FEES, scopedEntityId(profileId, String(id)), nextFee);
    return nextFee;
  });

  console.log(
    `[billing] Auto-generated next-month bill #${created.id} for ${created.student_name} (due ${created.due_date}, source: ${source})`
  );
  return created;
}

/**
 * Sweep the whole workspace: any active student whose latest bill for the
 * current cycle is settled (paid) gets the next month's pending bill created.
 * Used by the monthly cron so bills exist before reminders are sent.
 */
export async function generateNextMonthBillsForProfile(
  profileId: string
): Promise<Fee[]> {
  const studentRecords = await listScopedRecords<{ studentName: string; status?: string }>(
    APPWRITE_COLLECTIONS.students,
    profileId
  );
  const activeStudents = studentRecords
    .map((r) => r.data)
    .filter((s) => (s.status ?? 'Active').toLowerCase() !== 'inactive');

  const createdFees: Fee[] = [];
  for (const student of activeStudents) {
    const records = await listScopedRecords<Fee>(FEES, profileId);
    const studentFees = records
      .map((r) => r.data)
      .filter(
        (f) =>
          f.student_name.toLowerCase() === student.studentName.toLowerCase()
      )
      .sort((a, b) => b.due_date.localeCompare(a.due_date));
    if (studentFees.length === 0) continue;

    const latest = studentFees[0];
    if (MONTHLY_STATUS.has(latest.status)) {
      const created = await generateNextMonthBill(profileId, latest, 'cron');
      if (created) createdFees.push(created);
    }
  }
  return createdFees;
}

/** POST /api/fees/generate-next-month — manual auto-billing run for a workspace. */
export async function generateNextMonthBillsRoute(
  app: Pick<FastifyInstance, 'post'>
): Promise<void> {
  app.post('/api/fees/generate-next-month', async (req) => {
    const profileId = await resolveProfileId(req);
    const created = await generateNextMonthBillsForProfile(profileId);
    return {
      data: {
        created: created.length,
        fees: created,
      },
    };
  });
}

export async function getFeeById(profileId: string, feeId: number | string) {
  const record = await getRecord<Fee>(FEES, scopedEntityId(profileId, String(feeId)));
  return record?.data ?? null;
}
