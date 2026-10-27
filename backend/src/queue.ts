/**
 * Durable reminder send-queue.
 *
 * The monthly cron (and the manual trigger) no longer blasts WhatsApp sends
 * inline: they append a job here and return immediately. The independent
 * Python worker (queue-worker/worker.py) claims jobs, paces the messages with
 * randomized spacing (anti-ban), and reports results back, including a
 * release back to pending when WhatsApp was offline.
 *
 * Jobs live in Appwrite (`payment_settings`, one `<profileId>:reminder_queue`
 * row per workspace). Nothing is written to the local filesystem, so a backend
 * restart, redeploy, or server rebuild never loses or leaks queued messages.
 */
import {
  APPWRITE_COLLECTIONS,
  deleteRecord,
  listRecords,
  putRecord,
} from './appwrite.js';
import { scopedEntityId } from './tenant.js';

export interface QueueItem {
  phone: string;
  message: string;
  studentId?: string;
  studentName?: string;
  /** Interactive CTA button (e.g. "Pay Now" → payment portal link). */
  ctaUrl?: { displayText: string; url: string };
}

export interface ReminderQueueJob {
  /** Same id as the reminder run log it belongs to. */
  jobId: string;
  profileId: string;
  source: string;
  createdAt: string;
  status: 'pending' | 'in_progress';
  claimedAt: string | null;
  totalItems: number;
  items: QueueItem[];
}

interface QueueRow {
  jobs: ReminderQueueJob[];
}

const COLLECTION = APPWRITE_COLLECTIONS.paymentSettings;
/** Local part of the Appwrite entity id: `<profileId>:reminder_queue`. */
const QUEUE_ENTITY = 'reminder_queue';
const MAX_JOBS = 50;
/** A claimed job older than this is considered abandoned and re-claimable. */
const CLAIM_TIMEOUT_MS = 30 * 60 * 1000;

/** In-memory mirror, hydrated from Appwrite once per process. */
let jobs: ReminderQueueJob[] = [];
let hydration: Promise<void> | null = null;

function isQueueRecord(entityId: string): boolean {
  return entityId.endsWith(`:${QUEUE_ENTITY}`);
}

async function loadJobsFromAppwrite(): Promise<ReminderQueueJob[]> {
  const records = await listRecords<Partial<QueueRow>>(COLLECTION);
  const loaded: ReminderQueueJob[] = [];

  for (const record of records) {
    if (!isQueueRecord(record.entityId)) continue;
    const queue = Array.isArray(record.data?.jobs) ? record.data.jobs : [];
    for (const job of queue) {
      if (job && typeof job.jobId === 'string' && Array.isArray(job.items)) {
        loaded.push(job);
      }
    }
  }

  loaded.sort((a, b) =>
    String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  );
  return loaded.slice(-MAX_JOBS);
}

/**
 * Restore pending jobs from Appwrite. Safe to call repeatedly: the load runs
 * once and the same promise is returned. If Appwrite is unreachable the queue
 * stays in memory and the next call retries.
 */
export function hydrateQueue(): Promise<void> {
  if (!hydration) {
    hydration = loadJobsFromAppwrite()
      .then((loaded) => {
        jobs = loaded;
        console.log(`[queue] restored ${jobs.length} job(s) from Appwrite`);
      })
      .catch((err: any) => {
        hydration = null;
        console.error(
          `[queue] could not restore queue from Appwrite: ${err?.message ?? err}`
        );
      });
  }
  return hydration;
}

/** Replace one workspace's queue row (or delete it when nothing is left). */
async function writeProfileSnapshot(profileId: string): Promise<void> {
  const entityId = scopedEntityId(profileId, QUEUE_ENTITY);
  const profileJobs = jobs.filter((job) => job.profileId === profileId);
  try {
    if (profileJobs.length === 0) {
      await deleteRecord(COLLECTION, entityId);
    } else {
      await putRecord<QueueRow>(COLLECTION, entityId, { jobs: profileJobs });
    }
  } catch (err: any) {
    // Keep serving from memory; the next claim/finish retries the write.
    console.error(
      `[queue] failed to persist queue for ${profileId}: ${err?.message ?? err}`
    );
  }
}

// Appwrite writes for one workspace are serialised so an older snapshot can
// never overwrite a newer claim/finish result.
const writeChains = new Map<string, Promise<void>>();

function persistProfileQueue(profileId: string): Promise<void> {
  const previous = writeChains.get(profileId) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(() => writeProfileSnapshot(profileId));
  writeChains.set(profileId, run);
  return run.finally(() => {
    if (writeChains.get(profileId) === run) writeChains.delete(profileId);
  });
}

export async function enqueueReminderJob(job: ReminderQueueJob): Promise<void> {
  await hydrateQueue();

  jobs.push(job);
  const touched = new Set<string>([job.profileId]);

  if (jobs.length > MAX_JOBS) {
    const removed = jobs.slice(0, jobs.length - MAX_JOBS);
    jobs = jobs.slice(-MAX_JOBS);
    for (const entry of removed) touched.add(entry.profileId);
  }
  for (const profileId of touched) {
    await persistProfileQueue(profileId);
  }

  console.log(`[queue] enqueued job ${job.jobId} (${job.items.length} items)`);
}

/** Claim the oldest claimable job, or null when idle. Abandoned claims (older
 * than CLAIM_TIMEOUT_MS) are handed out again. */
export async function claimJob(): Promise<ReminderQueueJob | null> {
  await hydrateQueue();

  const now = Date.now();
  const claimable = jobs.find(
    (job) =>
      job.items.length > 0 &&
      (job.status === 'pending' ||
        (job.status === 'in_progress' &&
          job.claimedAt &&
          now - Date.parse(job.claimedAt) > CLAIM_TIMEOUT_MS))
  );
  if (!claimable) return null;

  claimable.status = 'in_progress';
  claimable.claimedAt = new Date().toISOString();
  await persistProfileQueue(claimable.profileId);
  console.log(`[queue] job ${claimable.jobId} claimed by worker`);
  return claimable;
}

/**
 * Report results for a job. With release=true the job goes back to pending
 * (e.g. WhatsApp was offline) — nothing is discarded. Otherwise the job is
 * removed from the queue.
 */
export async function finishJob(
  jobId: string,
  opts: { release?: boolean } = {}
): Promise<{ released: boolean; existed: boolean }> {
  await hydrateQueue();

  const job = jobs.find((entry) => entry.jobId === jobId);
  if (!job) return { released: false, existed: false };

  if (opts.release) {
    job.status = 'pending';
    job.claimedAt = null;
    await persistProfileQueue(job.profileId);
    console.log(`[queue] job ${jobId} released back to pending`);
    return { released: true, existed: true };
  }

  jobs = jobs.filter((entry) => entry.jobId !== jobId);
  await persistProfileQueue(job.profileId);
  console.log(`[queue] job ${jobId} finished and removed`);
  return { released: false, existed: true };
}

/** Queue depth for lightweight health checks. */
export async function queueDepth(): Promise<{
  pending: number;
  inProgress: number;
}> {
  await hydrateQueue();
  return {
    pending: jobs.filter((job) => job.status === 'pending').length,
    inProgress: jobs.filter((job) => job.status === 'in_progress').length,
  };
}

export function workerSecret(): string {
  return (process.env.WORKER_SECRET ?? '').trim();
}
