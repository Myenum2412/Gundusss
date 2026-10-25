/**
 * Durable reminder send-queue.
 *
 * The monthly cron (and the manual trigger) no longer blasts WhatsApp sends
 * inline: they append a job here and return immediately. The independent
 * Python worker (queue-worker/worker.py) claims jobs, paces the messages with
 * randomized spacing (anti-ban), and reports results back, including a
 * release back to pending when WhatsApp was offline.
 *
 * Jobs persist to .queue/queue.json so a backend restart never loses them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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

const QUEUE_DIR = '.queue';
const QUEUE_FILE = path.join(QUEUE_DIR, 'queue.json');
const MAX_JOBS = 50;
/** A claimed job older than this is considered abandoned and re-claimable. */
const CLAIM_TIMEOUT_MS = 30 * 60 * 1000;

let jobs: ReminderQueueJob[] = load();

function load(): ReminderQueueJob[] {
  try {
    if (!existsSync(QUEUE_FILE)) return [];
    const parsed = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (j: any) => j && typeof j.jobId === 'string' && Array.isArray(j.items)
    );
  } catch {
    return [];
  }
}

function save() {
  try {
    mkdirSync(QUEUE_DIR, { recursive: true });
    writeFileSync(QUEUE_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  } catch (err: any) {
    console.error(`[queue] failed to persist queue: ${err?.message ?? err}`);
  }
}

export function enqueueReminderJob(job: ReminderQueueJob): void {
  jobs.push(job);
  if (jobs.length > MAX_JOBS) {
    jobs = jobs.slice(-MAX_JOBS);
  }
  save();
  console.log(`[queue] enqueued job ${job.jobId} (${job.items.length} items)`);
}

/** Claim the oldest claimable job, or null when idle. Abandoned claims (older
 * than CLAIM_TIMEOUT_MS) are handed out again. */
export function claimJob(): ReminderQueueJob | null {
  const now = Date.now();
  const claimable = jobs.find(
    (j) =>
      j.items.length > 0 &&
      (j.status === 'pending' ||
        (j.status === 'in_progress' &&
          j.claimedAt &&
          now - Date.parse(j.claimedAt) > CLAIM_TIMEOUT_MS))
  );
  if (!claimable) return null;
  claimable.status = 'in_progress';
  claimable.claimedAt = new Date().toISOString();
  save();
  console.log(`[queue] job ${claimable.jobId} claimed by worker`);
  return claimable;
}

/**
 * Report results for a job. With release=true the job goes back to pending
 * (e.g. WhatsApp was offline) — nothing is discarded. Otherwise the job is
 * removed from the queue.
 */
export function finishJob(
  jobId: string,
  opts: { release?: boolean } = {}
): { released: boolean; existed: boolean } {
  const job = jobs.find((j) => j.jobId === jobId);
  if (!job) return { released: false, existed: false };
  if (opts.release) {
    job.status = 'pending';
    job.claimedAt = null;
    save();
    console.log(`[queue] job ${jobId} released back to pending`);
    return { released: true, existed: true };
  }
  jobs = jobs.filter((j) => j.jobId !== jobId);
  save();
  console.log(`[queue] job ${jobId} finished and removed`);
  return { released: false, existed: true };
}

/** Queue depth for lightweight health checks. */
export function queueDepth(): { pending: number; inProgress: number } {
  return {
    pending: jobs.filter((j) => j.status === 'pending').length,
    inProgress: jobs.filter((j) => j.status === 'in_progress').length,
  };
}

export function workerSecret(): string {
  return (process.env.WORKER_SECRET ?? '').trim();
}
