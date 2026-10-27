import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  APPWRITE_COLLECTIONS,
  getRecord,
  listScopedRecords,
  putRecord,
} from '../appwrite.js';
import { getProfile, listProfiles, resolveProfileId } from '../profiles.js';
import { scopedEntityId } from '../tenant.js';
import { getWaState, sendWaMessage } from '../whatsapp.js';
import { enqueueReminderJob, workerSecret, type QueueItem } from '../queue.js';
import { createGatewayCheckout } from './payments.js';

const CRONJOB_API_BASE = 'https://api.cron-job.org';
// Never hardcode this: set CRONJOB_API_KEY in backend/.env (gitignored) and in
// the deployment environment. An unset key simply surfaces as an API error.
const CRONJOB_API_KEY = (process.env.CRONJOB_API_KEY ?? '').trim();

/**
 * Attach the student id to a real gateway checkout URL so the reminder link can
 * be reconciled with the student. URLSearchParams keeps any query string the
 * gateway may already have added.
 */
function studentCheckoutUrl(paymentUrl: string, studentId: string): string {
  try {
    const parsed = new URL(paymentUrl);
    parsed.searchParams.set('student', studentId);
    return parsed.toString();
  } catch {
    const sep = paymentUrl.includes('?') ? '&' : '?';
    return `${paymentUrl}${sep}student=${encodeURIComponent(studentId)}`;
  }
}

function cronJobKey(storedKey?: string): string {
  const key = (storedKey || CRONJOB_API_KEY).trim();
  if (!key) {
    throw new Error('CRONJOB_API_KEY is not configured in the backend environment');
  }
  return key;
}

export interface CronScheduleConfig {
  timezone: string;
  hour: number;
  minute: number;
  /** Legacy single day. Kept for backwards compatibility with stored settings. */
  dayOfMonth: number;
  /** Due date of the fee (day of month, 1-28). Drives before/after offsets. */
  dueDate?: number;
  /** Reminder reminders N days before the due date (0-27). */
  daysBefore?: number;
  /** Reminder reminders N days after the due date (0-27). */
  daysAfter?: number;
  /**
   * Multi-day support: explicit list of days when reminders fire
   * (e.g. [1, 5, 15]). Cron-job.org receives these as mdays. Absent/empty
   * means "only dayOfMonth" (legacy behaviour).
   */
  daysOfMonth?: number[];
}

/**
 * Normalized, validated day list for a stored schedule. Priority:
 * explicit daysOfMonth > daysBefore/daysAfter around dueDate > legacy dayOfMonth.
 */
function scheduleDaysOfMonth(schedule?: Partial<CronScheduleConfig> | null): number[] {
  const clampDay = (n: unknown, fallback: number) => {
    const t = Math.trunc(Number(n));
    return Number.isInteger(t) && t >= 1 && t <= 28 ? t : fallback;
  };

  // 1. Explicit day list (sent by the UI after computing before/after).
  const multi = Array.isArray(schedule?.daysOfMonth)
    ? schedule!.daysOfMonth!
        .map((d) => Math.trunc(Number(d)))
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 28)
    : [];
  if (multi.length > 0) return Array.from(new Set(multi)).sort((a, b) => a - b);

  // 2. Relative to the due date: N days before + due date + M days after.
  const due = clampDay(schedule?.dueDate ?? schedule?.dayOfMonth, 1);
  const before = Math.min(27, Math.max(0, Math.trunc(Number(schedule?.daysBefore ?? 0)) || 0));
  const after = Math.min(27, Math.max(0, Math.trunc(Number(schedule?.daysAfter ?? 0)) || 0));
  const derived: number[] = [];
  for (let i = before; i >= 1; i--) {
    if (due - i >= 1) derived.push(due - i);
  }
  derived.push(due);
  for (let i = 1; i <= after; i++) {
    if (due + i <= 28) derived.push(due + i);
  }
  if (derived.length > 0) return Array.from(new Set(derived)).sort((a, b) => a - b);

  // 3. Legacy single day.
  return [due];
}

export interface ReminderRunLog {
  id: string;
  timestamp: string;
  jobId?: number;
  source: 'cron-job.org' | 'manual' | 'scheduled';
  totalStudents: number;
  sentCount: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'QUEUED';
  details: string;
  recipients: Array<{
    studentId: string;
    studentName: string;
    phone: string;
    amount: string;
    delivered: boolean;
    error?: string;
  }>;
}

export interface StoredReminderSettings {
  apiKey: string;
  enabled: boolean;
  jobId: number | null;
  targetUrl: string;
  title: string;
  schedule: CronScheduleConfig;
  lastRun: string | null;
  lastStatus: string | null;
  logs: ReminderRunLog[];
}

const DEFAULT_SCHEDULE: CronScheduleConfig = {
  timezone: 'Asia/Kolkata',
  hour: 9,
  minute: 0,
  dayOfMonth: 5, // legacy mirror of the due date
  dueDate: 5, // fee due on the 5th of every month
  daysBefore: 1, // one reminder the day before
  daysAfter: 0,
};

function defaultSettings(): StoredReminderSettings {
  return {
    apiKey: CRONJOB_API_KEY,
    enabled: true,
    jobId: 8715234, // ID created on cron-job.org
    targetUrl: 'https://myfees.myenum.in/api/reminders/cron/monthly',
    title: 'Monthly Student Fee Reminder (MyFees)',
    schedule: DEFAULT_SCHEDULE,
    lastRun: null,
    lastStatus: null,
    logs: [],
  };
}

// cron-job.org REST API wrappers
async function fetchCronJobs(apiKey: string) {
  const res = await fetch(`${CRONJOB_API_BASE}/jobs`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`cron-job.org API error (${res.status}): ${errorText}`);
  }
  return res.json();
}

async function createCronJob(apiKey: string, payload: {
  url: string;
  title: string;
  schedule: CronScheduleConfig;
}) {
  const body = {
    job: {
      url: payload.url,
      title: payload.title,
      enabled: true,
      saveResponses: true,
      requestMethod: 0, // GET request
      schedule: {
        timezone: payload.schedule.timezone || 'Asia/Kolkata',
        hours: [payload.schedule.hour],
        minutes: [payload.schedule.minute],
        // Multi-day-aware: falls back to the legacy single day of month.
        mdays: scheduleDaysOfMonth(payload.schedule),
        months: [-1], // every month
        wdays: [-1],  // every day of week
        expiresAt: 0,
      },
      notifyAfterFailedExecutions: 1,
      // Authenticate every webhook hit: cron-job.org sends this header with
      // each execution and the backend validates it (CRON_WEBHOOK_SECRET).
      headers: process.env.CRON_WEBHOOK_SECRET?.trim()
        || CRONJOB_API_KEY
        ? [{ name: 'X-Cron-Key', value: process.env.CRON_WEBHOOK_SECRET?.trim() || CRONJOB_API_KEY }]
        : undefined,
      // Email the account owner when consistently failing so missed fixes don't
      // silently skip a month of fee reminders.
      notification: {
        onFailure: true,
        onFailureCount: 1,
        onSuccess: false,
        onDisable: false,
        onSslCertExpiry: false,
        mode: 1,
      },
    },
  };

  const res = await fetch(`${CRONJOB_API_BASE}/jobs`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create cron job (${res.status}): ${errorText}`);
  }

  return res.json() as Promise<{ jobId: number }>;
}

async function deleteCronJob(apiKey: string, jobId: number) {
  const res = await fetch(`${CRONJOB_API_BASE}/jobs/${jobId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Failed to delete cron job (${res.status}): ${errorText}`);
  }
  return res.json();
}

/**
 * Execute student fee reminder notification for a given profile or all profiles.
 */
async function executeMonthlyReminders(
  profileId: string,
  source: 'cron-job.org' | 'manual' | 'scheduled'
): Promise<ReminderRunLog> {
  const profile = await getProfile(profileId);
  const companyName = profile?.name || 'MyFees';

  // 1. Load active students for this profile
  const studentRecords = await listScopedRecords<any>(
    APPWRITE_COLLECTIONS.students,
    profileId
  );
  const students = studentRecords.map((r) => r.data).filter((s) => s.status !== 'Inactive');

  // 2. Load fee structures & student groups to determine standard fee
  const feeRecords = await listScopedRecords<any>(
    APPWRITE_COLLECTIONS.feeStructures,
    profileId
  );
  const groupRecords = await listScopedRecords<any>(
    APPWRITE_COLLECTIONS.studentGroups,
    profileId
  );
  const feeMap = new Map<string, string>();
  for (const g of groupRecords) {
    if (g.data.groupName && g.data.feeAmount) {
      feeMap.set(g.data.groupName.toLowerCase(), String(g.data.feeAmount));
    }
  }

  const waState = getWaState();
  const isWaReady = waState.status === 'ready';
  // Queue mode: when the independent Python worker is configured (and the bot
  // is connected) reminder sends belong to the worker, which paces them with
  // randomized spacing instead of blasting them inline.
  const workerMode = Boolean(workerSecret());

  const recipientResults: ReminderRunLog['recipients'] = [];
  let sentCount = 0;
  const jobItems: QueueItem[] = [];

  for (const student of students) {
    const studentFee =
      feeMap.get((student.group || '').toLowerCase()) ||
      feeRecords[0]?.data?.amount ||
      '5000';
    const amountStr = `₹${parseFloat(studentFee).toLocaleString('en-IN')}`;
    const studentPhone = (student.phone || '').replace(/\D/g, '');

    const message = `🔔 *Monthly Fee Payment Reminder*\n\nDear Parent / Student *${student.studentName}*,\n\nThis is your monthly fee reminder for *${student.course || 'Course'}* (${student.group || 'Batch'}).\n\n• Student ID: *${student.studentId}*\n• Monthly Fee: *${amountStr}*\n• Due Date: 5th of this month\n\nPlease tap the link below to pay directly via UPI / Card:\n\n— ${companyName} Accounts Desk`;

    // Every reminder must carry a real, payable gateway checkout. Never fall
    // back to a hand-built workspace page URL: those links could not be
    // reconciled with a gateway order and often pointed at another tenant.
    let studentPaymentUrl = '';
    let linkError: string | undefined;
    if (studentPhone.length >= 10 && isWaReady) {
      try {
        const checkout = await createGatewayCheckout({
          profileId,
          studentId: student.studentId,
          studentName: student.studentName,
          amount: studentFee,
          email: student.email,
          phone: studentPhone,
          description: `Monthly fee payment for ${student.studentName} (${student.studentId})`,
          method: 'UPI',
          source: 'fee-reminder',
          eventMessage: 'Monthly reminder checkout created.',
        });
        studentPaymentUrl = studentCheckoutUrl(
          checkout.paymentUrl,
          student.studentId
        );
      } catch (err: any) {
        linkError =
          err?.message || 'Could not create a payment link for this student.';
        console.warn(
          `[reminders] Could not create a gateway checkout for ${student.studentId}: ${linkError}`
        );
      }
    }

    if (workerMode && studentPhone.length >= 10) {
      if (isWaReady && studentPaymentUrl) {
        // Hand over to the queue worker; the run log gets merged when the
        // worker reports results. The payment link rides along as a
        // WhatsApp-native CTA-URL button ("Pay Now").
        jobItems.push({
          phone: studentPhone,
          message,
          studentId: student.studentId,
          studentName: student.studentName,
          ctaUrl: { displayText: 'Pay Now', url: studentPaymentUrl },
        });
        recipientResults.push({
          studentId: student.studentId,
          studentName: student.studentName,
          phone: student.phone,
          amount: studentFee,
          delivered: false,
          error: 'Queued for paced delivery',
        });
      } else {
        recipientResults.push({
          studentId: student.studentId,
          studentName: student.studentName,
          phone: student.phone,
          amount: studentFee,
          delivered: false,
          error:
            linkError ??
            'WhatsApp bot offline (queued for auto-send)',
        });
      }
      continue;
    }

    let delivered = false;
    let errorMsg: string | undefined;

    if (studentPhone.length >= 10 && isWaReady && studentPaymentUrl) {
      try {
        await sendWaMessage(studentPhone, message, [], {
          displayText: 'Pay Now',
          url: studentPaymentUrl,
        });
        delivered = true;
        sentCount++;
      } catch (err: any) {
        errorMsg = err?.message || 'WhatsApp send failed';
      }
    } else if (studentPhone.length >= 10) {
      delivered = false;
      errorMsg =
        linkError ??
        (isWaReady ? 'Invalid phone' : 'WhatsApp bot offline (queued for auto-send)');
    }

    recipientResults.push({
      studentId: student.studentId,
      studentName: student.studentName,
      phone: student.phone,
      amount: studentFee,
      delivered,
      error: errorMsg,
    });
  }

  let status: ReminderRunLog['status'] = 'SUCCESS';
  let details = '';

  if (students.length === 0) {
    status = 'SKIPPED';
    details = 'No active students found for monthly fee reminders.';
  } else if (workerMode && isWaReady && jobItems.length > 0) {
    // Nothing has been sent here — the Python queue worker owns delivery now.
    status = 'QUEUED';
    details = `${jobItems.length} reminder(s) queued; the queue worker delivers them one by one with randomized spacing (anti-ban).`;
  } else if (isWaReady) {
    if (sentCount === students.length) {
      status = 'SUCCESS';
      details = `Delivered monthly fee reminders to all ${sentCount} student(s) via WhatsApp.`;
    } else if (sentCount > 0) {
      status = 'PARTIAL';
      details = `Delivered to ${sentCount}/${students.length} student(s) via WhatsApp.`;
    } else {
      // Bot is connected but not a single send succeeded — this is a real
      // failure (bad numbers, protocol errors), not a success.
      status = 'FAILED';
      const firstError =
        recipientResults.find((r) => !r.delivered && r.error)?.error ?? undefined;
      details = `No messages delivered. WhatsApp bot is connected but every send failed${
        firstError ? `: ${firstError}` : '.'
      }`;
    }
  } else {
    // WhatsApp client is offline / waiting for QR: nothing was delivered.
    status = 'FAILED';
    details = `WhatsApp bot is offline — no messages delivered. Reminders were generated for ${students.length} student(s); connect the bot on the Settings page and re-run.`;
  }

  const runLog: ReminderRunLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source,
    totalStudents: students.length,
    sentCount,
    status,
    details,
    recipients: recipientResults,
  };

  if (workerMode && isWaReady && jobItems.length > 0) {
    await enqueueReminderJob({
      jobId: runLog.id,
      profileId,
      source,
      createdAt: runLog.timestamp,
      status: 'pending',
      claimedAt: null,
      totalItems: jobItems.length,
      items: jobItems,
    });
  }

  return runLog;
}

export async function reminderRoutes(app: FastifyInstance) {
  // Cron-job.org fetches this URL on schedule. The job carries an
  // X-Cron-Key header (mirror of CRON_WEBHOOK_SECRET) — requests without a
  // valid key are rejected so the webhook cannot be triggered publicly.
  // Falls back to CRONJOB_API_KEY when the dedicated secret is not set, so
  // existing deployments keep working after a backend-only upgrade.
  const cronWebhookSecret = (): string => {
    if (process.env.CRON_WEBHOOK_SECRET?.trim()) {
      return process.env.CRON_WEBHOOK_SECRET.trim();
    }
    return CRONJOB_API_KEY;
  };
  const timingSafeEqualStr = (a: string, b: string): boolean => {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return ha.length === hb.length && timingSafeEqual(ha, hb);
  };

  // Public Webhook hit by cron-job.org on schedule
  // Handles both GET and POST so cron-job.org standard GET monitor works out of the box!
  const handleCronTrigger = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const presented =
        (typeof req.headers['x-cron-key'] === 'string'
          ? req.headers['x-cron-key'].trim()
          : '') ||
        ((req.query as { key?: string } | undefined)?.key ?? '').trim();
      if (
        !cronWebhookSecret() ||
        !presented ||
        !timingSafeEqualStr(presented, cronWebhookSecret())
      ) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized cron trigger: valid X-Cron-Key required' });
      }

      // Find default profile (Amarnath / ORG-XD3SLDDC or all profiles)
      const profiles = await listProfiles();
      const targetProfile =
        profiles.find((p) => p.profileId === 'ORG-XD3SLDDC') || profiles[0];

      if (!targetProfile) {
        return reply.code(404).send({ error: 'No active profile found for cron' });
      }

      const runLog = await executeMonthlyReminders(
        targetProfile.profileId,
        'cron-job.org'
      );

      // Load settings and append log
      const record = await getRecord<StoredReminderSettings>(
        APPWRITE_COLLECTIONS.paymentSettings,
        scopedEntityId(targetProfile.profileId, 'cron_reminders')
      );
      const settings = record?.data || defaultSettings();
      settings.lastRun = runLog.timestamp;
      settings.lastStatus = runLog.status;
      settings.logs = [runLog, ...(settings.logs || [])].slice(0, 50);

      await putRecord(
        APPWRITE_COLLECTIONS.paymentSettings,
        scopedEntityId(targetProfile.profileId, 'cron_reminders'),
        settings
      );

      return {
        success: true,
        message: 'Monthly fee reminder cron executed successfully',
        jobId: settings.jobId,
        runLog,
      };
    } catch (err: any) {
      req.log.error(err, 'Failed to execute cron-job reminder');
      return reply.code(500).send({
        error: 'Cron execution failed',
        message: err?.message,
      });
    }
  };

  app.get('/api/reminders/cron/monthly', handleCronTrigger);
  app.post('/api/reminders/cron/monthly', handleCronTrigger);

  // GET /api/reminders/status - Get current cron-job.org status, settings & logs
  app.get('/api/reminders/status', async (req) => {
    const profileId = await resolveProfileId(req);
    const record = await getRecord<StoredReminderSettings>(
      APPWRITE_COLLECTIONS.paymentSettings,
      scopedEntityId(profileId, 'cron_reminders')
    );
    const settings = record?.data || defaultSettings();

    // Query live cron-job.org API to get real-time schedule & nextExecution
    let cronJobRemote: any = null;
    let cronJobError: string | null = null;

    try {
      const data = await fetchCronJobs(cronJobKey(settings.apiKey));
      if (data?.jobs && Array.isArray(data.jobs)) {
        cronJobRemote =
          data.jobs.find((j: any) => j.jobId === settings.jobId) ||
          data.jobs[0] ||
          null;
      }
    } catch (err: any) {
      cronJobError = err?.message || 'Could not connect to cron-job.org';
    }

    return {
      data: {
        settings,
        cronJobRemote,
        cronJobError,
        connected: Boolean(cronJobRemote),
      },
    };
  });

  // POST /api/reminders/sync - Create or update the monthly cron job on cron-job.org
  app.post('/api/reminders/sync', async (req, reply) => {
    const profileId = await resolveProfileId(req);
    const body = (req.body as any) || {};

    const apiKey = cronJobKey(body.apiKey);
    const title = body.title || 'Monthly Student Fee Reminder (MyFees)';
    const targetUrl =
      body.targetUrl || 'https://myfees.myenum.in/api/reminders/cron/monthly';
    const rawSchedule = (body.schedule || DEFAULT_SCHEDULE) as Partial<CronScheduleConfig>;
    // Sanitize: normalize days + clamp time fields so cron-job.org never
    // receives an invalid schedule.
    const schedule: CronScheduleConfig = {
      timezone: typeof rawSchedule.timezone === 'string' && rawSchedule.timezone.trim()
        ? rawSchedule.timezone.trim()
        : DEFAULT_SCHEDULE.timezone,
      hour: Math.min(23, Math.max(0, Math.trunc(Number(rawSchedule.hour ?? 9)) || 0)),
      minute: Math.min(59, Math.max(0, Math.trunc(Number(rawSchedule.minute ?? 0)) || 0)),
      dueDate: Math.min(28, Math.max(1, Math.trunc(Number(rawSchedule.dueDate ?? rawSchedule.dayOfMonth ?? DEFAULT_SCHEDULE.dueDate)) || (DEFAULT_SCHEDULE.dueDate as number))),
      daysBefore: Math.min(27, Math.max(0, Math.trunc(Number(rawSchedule.daysBefore ?? 0)) || 0)),
      daysAfter: Math.min(27, Math.max(0, Math.trunc(Number(rawSchedule.daysAfter ?? 0)) || 0)),
      dayOfMonth: scheduleDaysOfMonth(rawSchedule)[0],
      daysOfMonth: scheduleDaysOfMonth(rawSchedule),
    };

    try {
      const created = await createCronJob(apiKey, {
        url: targetUrl,
        title,
        schedule,
      });

      const record = await getRecord<StoredReminderSettings>(
        APPWRITE_COLLECTIONS.paymentSettings,
        scopedEntityId(profileId, 'cron_reminders')
      );
      const settings = record?.data || defaultSettings();
      settings.apiKey = apiKey;
      settings.jobId = created.jobId;
      settings.title = title;
      settings.targetUrl = targetUrl;
      settings.schedule = schedule;
      settings.enabled = true;

      await putRecord(
        APPWRITE_COLLECTIONS.paymentSettings,
        scopedEntityId(profileId, 'cron_reminders'),
        settings
      );

      return {
        data: {
          success: true,
          jobId: created.jobId,
          settings,
        },
      };
    } catch (err: any) {
      return reply.code(400).send({
        error: 'Failed to create job on cron-job.org',
        details: err?.message,
      });
    }
  });

  // POST /api/reminders/trigger - Run the monthly fee reminder right now manually
  app.post('/api/reminders/trigger', async (req, reply) => {
    const profileId = await resolveProfileId(req);
    try {
      const runLog = await executeMonthlyReminders(profileId, 'manual');

      const record = await getRecord<StoredReminderSettings>(
        APPWRITE_COLLECTIONS.paymentSettings,
        scopedEntityId(profileId, 'cron_reminders')
      );
      const settings = record?.data || defaultSettings();
      settings.lastRun = runLog.timestamp;
      settings.lastStatus = runLog.status;
      settings.logs = [runLog, ...(settings.logs || [])].slice(0, 50);

      await putRecord(
        APPWRITE_COLLECTIONS.paymentSettings,
        scopedEntityId(profileId, 'cron_reminders'),
        settings
      );

      return {
        data: {
          success: true,
          runLog,
          settings,
        },
      };
    } catch (err: any) {
      return reply.code(500).send({
        error: 'Failed to trigger reminders',
        details: err?.message,
      });
    }
  });

  // DELETE /api/reminders/job/:jobId - Delete a job from cron-job.org
  app.delete('/api/reminders/job/:jobId', async (req, reply) => {
    const profileId = await resolveProfileId(req);
    const { jobId } = req.params as { jobId: string };

    const record = await getRecord<StoredReminderSettings>(
      APPWRITE_COLLECTIONS.paymentSettings,
      scopedEntityId(profileId, 'cron_reminders')
    );
    const settings = record?.data || defaultSettings();

    try {
      await deleteCronJob(cronJobKey(settings.apiKey), Number(jobId));
      if (settings.jobId === Number(jobId)) {
        settings.jobId = null;
        settings.enabled = false;
        await putRecord(
          APPWRITE_COLLECTIONS.paymentSettings,
          scopedEntityId(profileId, 'cron_reminders'),
          settings
        );
      }
      return { data: { success: true } };
    } catch (err: any) {
      return reply.code(400).send({
        error: 'Failed to delete cron job',
        details: err?.message,
      });
    }
  });

  // DELETE /api/reminders/logs - Clear execution logs
  app.delete('/api/reminders/logs', async (req, reply) => {
    const profileId = await resolveProfileId(req);
    const record = await getRecord<StoredReminderSettings>(
      APPWRITE_COLLECTIONS.paymentSettings,
      scopedEntityId(profileId, 'cron_reminders')
    );
    const settings = record?.data || defaultSettings();
    settings.logs = [];
    settings.lastStatus = null;
    await putRecord(
      APPWRITE_COLLECTIONS.paymentSettings,
      scopedEntityId(profileId, 'cron_reminders'),
      settings
    );
    return { data: { success: true, settings } };
  });
}

