/**
 * One-time import of the legacy Postgres/PGlite data into Appwrite.
 *
 * Appwrite is the primary store after this import. This script only reads from
 * Postgres; it never deletes Appwrite documents, so it is safe to re-run.
 *
 * Usage:
 *   npm run appwrite:migrate --workspace=backend
 *   $env:MIGRATE_DATABASE_URL="postgres://user:pass@host:5432/db"; npm run appwrite:migrate --workspace=backend
 *
 * When MIGRATE_DATABASE_URL is not set, the script uses the embedded PGlite
 * server on port 5433 (the previous `npm run dev` setup). Otherwise it uses
 * DATABASE_URL from backend/.env.
 */
import '../src/env.js';
import net from 'node:net';

async function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

if (process.env.MIGRATE_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATE_DATABASE_URL;
} else if (await portOpen(5433)) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/postgres';
}

const { pool } = await import('./legacy-pg.js');
const { APPWRITE_COLLECTIONS, assertAppwriteSetup, putRecord } = await import(
  '../src/appwrite.js'
);

type Row = Record<string, unknown>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readRows(sql: string): Promise<Row[]> {
  const result = await pool.query(sql);
  return result.rows as Row[];
}

async function importFees(): Promise<number> {
  const rows = await readRows(
    `SELECT id, student_name, amount, status,
            to_char(due_date, 'YYYY-MM-DD') AS due_date,
            created_at
       FROM fees
      ORDER BY id`
  );
  for (const row of rows) {
    const id = Number(row.id);
    await putRecord(APPWRITE_COLLECTIONS.fees, String(id), {
      id,
      student_name: String(row.student_name ?? ''),
      amount: String(row.amount ?? ''),
      status: String(row.status ?? 'pending'),
      due_date: String(row.due_date ?? ''),
      created_at: iso(row.created_at),
    });
  }
  return rows.length;
}

async function importUsers(): Promise<number> {
  const rows = await readRows(
    'SELECT id, email, password_hash, created_at FROM users ORDER BY id'
  );
  for (const row of rows) {
    const email = String(row.email ?? '').toLowerCase().trim();
    if (!email) continue;
    await putRecord(APPWRITE_COLLECTIONS.users, email, {
      id: Number(row.id),
      email,
      password_hash: String(row.password_hash ?? ''),
      created_at: iso(row.created_at),
    });
  }
  return rows.length;
}

async function importStudents(): Promise<number> {
  const rows = await readRows(
    `SELECT student_id, student_name, dob, gender, guardian, phone, email,
            address, class_group, course, joining_date, status
       FROM students
      ORDER BY student_id`
  );
  for (const row of rows) {
    const studentId = String(row.student_id ?? '');
    if (!studentId) continue;
    await putRecord(APPWRITE_COLLECTIONS.students, studentId, {
      studentId,
      studentName: String(row.student_name ?? ''),
      dob: String(row.dob ?? ''),
      gender: String(row.gender ?? ''),
      guardian: String(row.guardian ?? ''),
      phone: String(row.phone ?? ''),
      email: String(row.email ?? ''),
      address: String(row.address ?? ''),
      group: String(row.class_group ?? ''),
      course: String(row.course ?? ''),
      joiningDate: String(row.joining_date ?? ''),
      status: String(row.status ?? ''),
    });
  }
  return rows.length;
}

async function importGroups(): Promise<number> {
  const rows = await readRows(
    `SELECT group_id, group_name, course, batch, fee_amount, fee_frequency,
            start_date, end_date, description, student_ids
       FROM student_groups
      ORDER BY group_id`
  );
  for (const row of rows) {
    const groupId = String(row.group_id ?? '');
    if (!groupId) continue;
    await putRecord(APPWRITE_COLLECTIONS.studentGroups, groupId, {
      groupId,
      groupName: String(row.group_name ?? ''),
      course: String(row.course ?? ''),
      batch: String(row.batch ?? ''),
      feeAmount: String(row.fee_amount ?? ''),
      feeFrequency: String(row.fee_frequency ?? ''),
      startDate: String(row.start_date ?? ''),
      endDate: String(row.end_date ?? ''),
      description: String(row.description ?? ''),
      studentIds: strings(row.student_ids),
    });
  }
  return rows.length;
}

async function importFeeStructures(): Promise<number> {
  const rows = await readRows(
    `SELECT structure_id, structure_name, course_group, fee_type, amount,
            frequency, due_date, late_fee, payment_methods, status,
            description, student_ids
       FROM fee_structures
      ORDER BY structure_id`
  );
  for (const row of rows) {
    const structureId = String(row.structure_id ?? '');
    if (!structureId) continue;
    await putRecord(APPWRITE_COLLECTIONS.feeStructures, structureId, {
      structureId,
      structureName: String(row.structure_name ?? ''),
      courseGroup: String(row.course_group ?? ''),
      feeType: String(row.fee_type ?? ''),
      amount: String(row.amount ?? ''),
      frequency: String(row.frequency ?? ''),
      dueDate: String(row.due_date ?? ''),
      lateFee: String(row.late_fee ?? ''),
      paymentMethods: strings(row.payment_methods),
      status: String(row.status ?? ''),
      description: String(row.description ?? ''),
      studentIds: strings(row.student_ids),
    });
  }
  return rows.length;
}

async function importReceipts(): Promise<number> {
  const rows = await readRows(
    `SELECT receipt_id, student_id, student_name, amount, method,
            payment_date, status, notes
       FROM receipts
      ORDER BY receipt_id`
  );
  for (const row of rows) {
    const receiptId = String(row.receipt_id ?? '');
    if (!receiptId) continue;
    await putRecord(APPWRITE_COLLECTIONS.receipts, receiptId, {
      receiptId,
      studentId: String(row.student_id ?? ''),
      studentName: String(row.student_name ?? ''),
      amount: String(row.amount ?? ''),
      method: String(row.method ?? ''),
      paymentDate: String(row.payment_date ?? ''),
      status: String(row.status ?? ''),
      notes: String(row.notes ?? ''),
    });
  }
  return rows.length;
}

async function importAnnouncements(): Promise<number> {
  const rows = await readRows(
    `SELECT announcement_id, title, message, recipient_ids, recipient_names,
            sent_count, failed_count, status, created_at
       FROM announcements
      ORDER BY announcement_id`
  );
  for (const row of rows) {
    const announcementId = String(row.announcement_id ?? '');
    if (!announcementId) continue;
    await putRecord(APPWRITE_COLLECTIONS.announcements, announcementId, {
      announcementId,
      title: String(row.title ?? ''),
      message: String(row.message ?? ''),
      recipientIds: strings(row.recipient_ids),
      recipientNames: strings(row.recipient_names),
      sentCount: Number(row.sent_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
      status: String(row.status ?? 'Sent'),
      createdAt: iso(row.created_at),
    });
  }
  return rows.length;
}

async function importDropdowns(): Promise<number> {
  const rows = await readRows(
    'SELECT list_key, options FROM dropdown_options ORDER BY list_key'
  );
  for (const row of rows) {
    const listKey = String(row.list_key ?? '');
    if (!listKey) continue;
    await putRecord(APPWRITE_COLLECTIONS.dropdownOptions, listKey, strings(row.options));
  }
  return rows.length;
}

async function importPaymentOrders(): Promise<number> {
  const rows = await readRows(
    `SELECT order_id, payment_id, student_id, student_name, fee_id, amount,
            status, gateway_status, method, utr, checkout_url, receipt_id,
            created_at, updated_at
       FROM payment_orders
      ORDER BY created_at, order_id`
  );
  for (const row of rows) {
    const orderId = String(row.order_id ?? '');
    if (!orderId) continue;
    await putRecord(APPWRITE_COLLECTIONS.paymentOrders, orderId, {
      orderId,
      paymentId: row.payment_id ? String(row.payment_id) : null,
      studentId: String(row.student_id ?? ''),
      studentName: String(row.student_name ?? ''),
      feeId: numberOrNull(row.fee_id),
      amount: String(row.amount ?? ''),
      status: String(row.status ?? ''),
      gatewayStatus: String(row.gateway_status ?? ''),
      method: String(row.method ?? ''),
      utr: String(row.utr ?? ''),
      checkoutUrl: String(row.checkout_url ?? ''),
      receiptId: row.receipt_id ? String(row.receipt_id) : null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    });
  }
  return rows.length;
}

async function importPaymentEvents(): Promise<number> {
  const rows = await readRows(
    `SELECT id, order_id, status, gateway_status, method, source, message,
            created_at
       FROM payment_events
      ORDER BY id`
  );
  for (const row of rows) {
    const id = String(row.id ?? '');
    if (!id) continue;
    await putRecord(APPWRITE_COLLECTIONS.paymentEvents, id, {
      id,
      orderId: String(row.order_id ?? ''),
      status: String(row.status ?? ''),
      gatewayStatus: String(row.gateway_status ?? ''),
      method: String(row.method ?? ''),
      source: String(row.source ?? ''),
      message: String(row.message ?? ''),
      createdAt: iso(row.created_at),
    });
  }
  return rows.length;
}

async function importPaymentSettings(): Promise<number> {
  const rows = await readRows(
    `SELECT upi_id, payee_name, qr_code_data_url, updated_at
       FROM payment_settings
      WHERE id = 1`
  );
  const row = rows[0];
  if (!row) return 0;
  await putRecord(APPWRITE_COLLECTIONS.paymentSettings, '1', {
    upi_id: String(row.upi_id ?? ''),
    payee_name: String(row.payee_name ?? ''),
    qr_code_data_url: String(row.qr_code_data_url ?? ''),
    updated_at: iso(row.updated_at),
  });
  return 1;
}

async function importBusinessProfile(): Promise<number> {
  const rows = await readRows(
    'SELECT data, updated_at FROM business_profiles WHERE id = 1'
  );
  const row = rows[0];
  if (!row) return 0;
  await putRecord(APPWRITE_COLLECTIONS.businessProfiles, '1', {
    profile: row.data ?? {},
    updatedAt: iso(row.updated_at),
  });
  return 1;
}

const steps: Array<[string, () => Promise<number>]> = [
  ['fees', importFees],
  ['users', importUsers],
  ['students', importStudents],
  ['student_groups', importGroups],
  ['fee_structures', importFeeStructures],
  ['receipts', importReceipts],
  ['announcements', importAnnouncements],
  ['dropdown_options', importDropdowns],
  ['payment_orders', importPaymentOrders],
  ['payment_events', importPaymentEvents],
  ['payment_settings', importPaymentSettings],
  ['business_profiles', importBusinessProfile],
];

function redactDatabaseUrl(value: string | undefined): string {
  if (!value) return '(not set)';
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(configured)';
  }
}

console.log(`Importing from: ${redactDatabaseUrl(process.env.DATABASE_URL)}`);
console.log('Checking Appwrite collections…');
await assertAppwriteSetup();

try {
  for (const [name, run] of steps) {
    try {
      const count = await run();
      console.log(`  ${name}: ${count}`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '42P01') {
        console.warn(`  ${name}: skipped (table does not exist)`);
        continue;
      }
      throw err;
    }
  }
  console.log('Import complete. Appwrite is now the primary store.');
} finally {
  await pool.end();
}
