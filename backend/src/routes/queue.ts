import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { claimJob, finishJob, queueDepth, workerSecret } from '../queue.js';
import { APPWRITE_COLLECTIONS, getRecord, putRecord } from '../appwrite.js';
import { scopedEntityId } from '../tenant.js';
import { sendWaMessage, waSessionKeyFor } from '../whatsapp.js';
import type { ReminderRunLog } from './reminders.js';

const ResultItemSchema = z.object({
  // The worker may report a per-item failure without a dialable phone; the
  // merge step simply skips unmatched phones. Nulls are allowed because
  // Python's json.dumps serialises None as null (never undefined).
  phone: z.string().max(20),
  studentId: z.string().max(60).nullish(),
  delivered: z.boolean(),
  error: z.string().max(500).nullish(),
});

const ResultSchema = z.object({
  jobId: z.string().min(1).max(200),
  profileId: z.string().min(1).max(60),
  release: z.boolean().optional(),
  results: z.array(ResultItemSchema).max(2000).optional(),
});

function requireWorker(req: FastifyRequest, reply: FastifyReply): boolean {
  const presented =
    typeof req.headers['x-worker-key'] === 'string'
      ? (req.headers['x-worker-key'] as string).trim()
      : '';
  const secret = workerSecret();
  if (!secret) {
    reply
      .code(503)
      .send({ error: 'Queue worker mode is disabled (WORKER_SECRET not set).' });
    return false;
  }
  if (presented !== secret) {
    reply.code(401).send({ error: 'Unauthorized worker request.' });
    return false;
  }
  return true;
}

export async function queueRoutes(app: FastifyInstance) {
  // POST /api/queue/claim - the Python worker asks for the next reminder job
  app.post('/api/queue/claim', async (req, reply) => {
    if (!requireWorker(req, reply)) return;
    const job = await claimJob();
    if (!job) {
      return { data: { job: null } };
    }
    return {
      data: {
        job: {
          jobId: job.jobId,
          profileId: job.profileId,
          createdAt: job.createdAt,
          totalItems: job.totalItems,
          items: job.items,
        },
      },
    };
  });

  // POST /api/queue/send - the worker pushes one paced message through the
  // Baileys engine (which applies its own final safety spacing). The item
  // carries the owning user's WhatsApp session key, so each workspace's
  // reminders go through that workspace owner's own connected WhatsApp number.
  app.post('/api/queue/send', async (req, reply) => {
    if (!requireWorker(req, reply)) return;
    const body = (req.body as any) || {};
    const phone = String(body.phone ?? '');
    const message = String(body.message ?? '');
    if (!phone || !message) {
      return reply
        .code(400)
        .send({ error: 'A phone and message are required.' });
    }
    const cta =
      body.ctaUrl && typeof body.ctaUrl.displayText === 'string' && typeof body.ctaUrl.url === 'string'
        ? { displayText: body.ctaUrl.displayText, url: body.ctaUrl.url }
        : undefined;
    const userEmail = typeof body.userEmail === 'string' ? body.userEmail.trim().toLowerCase() : '';
    const waKey = userEmail ? waSessionKeyFor(userEmail) : waSessionKeyFor();
    try {
      const result = await sendWaMessage(phone, message, [], cta, waKey);
      return { data: { delivered: true, id: result.id } };
    } catch (err: any) {
      return reply.code(err?.statusCode ?? 500).send({
        data: { delivered: false },
        error: err?.message ?? 'WhatsApp send failed',
      });
    }
  });

  // POST /api/queue/result - the worker reports per-recipient outcomes
  app.post('/api/queue/result', async (req, reply) => {
    if (!requireWorker(req, reply)) return;
    const parsed = ResultSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { jobId, profileId, results, release } = parsed.data;

    if (release) {
      // WhatsApp was offline / send loop aborted: put the job back so it is
      // retried later instead of being lost.
      await finishJob(jobId, { release: true });
      return { data: { released: true } };
    }

    const outcome = await finishJob(jobId);
    if (!outcome.existed) {
      // Already finished by an earlier result post or cleaned up.
      return { data: { merged: false } };
    }
    let merged = false;
    if (results && results.length > 0) {
      merged = await mergeResultsIntoLog(jobId, profileId, results);
    }
    return { data: { merged } };
  });

  // GET /api/queue/depth - lightweight visibility (session-authenticated)
  app.get('/api/queue/depth', async () => {
    return { data: await queueDepth() };
  });
}

/**
 * Fold per-recipient worker results back into the reminder run log that the
 * cron/trigger created with status QUEUED.
 */
async function mergeResultsIntoLog(
  jobId: string,
  profileId: string,
  results: Array<{
    phone: string;
    studentId?: string | null;
    delivered: boolean;
    error?: string | null;
  }>
): Promise<boolean> {
  const record = await getRecord<{
    apiKey: string;
    enabled: boolean;
    jobId: number | null;
    targetUrl: string;
    title: string;
    schedule: Record<string, unknown>;
    lastRun: string | null;
    lastStatus: string | null;
    logs: ReminderRunLog[];
  }>(APPWRITE_COLLECTIONS.paymentSettings, scopedEntityId(profileId, 'cron_reminders'));
  if (!record?.data) return false;
  const settings = record.data;
  const log = (settings.logs || []).find((l) => l.id === jobId);
  if (!log) return false;

  let sent = 0;
  const errors: string[] = [];
  log.recipients = log.recipients || [];
  for (const r of results) {
    const workerKey = r.phone.replace(/\D/g, '');
    const idx = log.recipients.findIndex(
      (x) =>
        (x.phone || '').replace(/\D/g, '') === workerKey ||
        (!!r.studentId && x.studentId === r.studentId)
    );
    if (idx >= 0) {
      log.recipients[idx].delivered = r.delivered;
      if (r.error) log.recipients[idx].error = r.error;
    }
    if (r.delivered) sent++;
    else if (r.error) errors.push(r.error);
  }

  log.sentCount = sent;
  log.status =
    log.totalStudents === 0
      ? 'SKIPPED'
      : sent === log.totalStudents
        ? 'SUCCESS'
        : sent > 0
          ? 'PARTIAL'
          : 'FAILED';
  log.details =
    log.totalStudents > 0 && sent === log.totalStudents
      ? `Delivered monthly fee reminders to all ${sent} student(s) via WhatsApp (queued).`
      : sent > 0
        ? `Delivered to ${sent}/${log.totalStudents} student(s) via the queue worker.`
        : `No messages delivered by the queue worker${
            errors[0] ? `: ${errors[0]}` : ' — connect WhatsApp and re-run.'
          }`;

  settings.lastStatus = log.status;
  await putRecord(
    APPWRITE_COLLECTIONS.paymentSettings,
    scopedEntityId(profileId, 'cron_reminders'),
    settings
  );
  return true;
}
