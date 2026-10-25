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

const CRONJOB_API_BASE = 'https://api.cron-job.org';
// Never hardcode this: set CRONJOB_API_KEY in backend/.env (gitignored) and in
// the deployment environment. An unset key simply surfaces as an API error.
const CRONJOB_API_KEY = (process.env.CRONJOB_API_KEY ?? '').trim();

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
  dayOfMonth: number;
}

export interface ReminderRunLog {
  id: string;
  timestamp: string;
  jobId?: number;
  source: 'cron-job.org' | 'manual' | 'scheduled';
  totalStudents: number;
  sentCount: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
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
  dayOfMonth: 1, // 1st of every month
};

function defaultSettings(): StoredReminderSettings {
  return {
    apiKey: CRONJOB_API_KEY,
    enabled: true,
    jobId: 8715234, // ID created on cron-job.org
    targetUrl: 'https://myfees.myenum.in/api/reminders/cron/monthly',
    title: 'Monthly Student Fee Reminder (Seeds of Success)',
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
        mdays: [payload.schedule.dayOfMonth],
        months: [-1], // every month
        wdays: [-1],  // every day of week
        expiresAt: 0,
      },
      notifyAfterFailedExecutions: 1,
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
  const companyName = profile?.name || 'Seeds of Success';
  const paymentBaseUrl = profile?.paymentUrl || 'https://myfees.myenum.in/amarnath';

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

  const recipientResults: ReminderRunLog['recipients'] = [];
  let sentCount = 0;

  for (const student of students) {
    const studentFee =
      feeMap.get((student.group || '').toLowerCase()) ||
      feeRecords[0]?.data?.amount ||
      '5000';
    const amountStr = `₹${parseFloat(studentFee).toLocaleString('en-IN')}`;
    const studentPhone = (student.phone || '').replace(/\D/g, '');

    const studentPaymentUrl = `${paymentBaseUrl}?student=${encodeURIComponent(student.studentId)}`;
    const message = `🔔 *Monthly Fee Payment Reminder*\n\nDear Parent / Student *${student.studentName}*,\n\nThis is your monthly fee reminder for *${student.course || 'Course'}* (${student.group || 'Batch'}).\n\n• Student ID: *${student.studentId}*\n• Monthly Fee: *${amountStr}*\n• Due Date: 5th of this month\n\nPlease tap the link below to pay directly via UPI / Card:\n👉 ${studentPaymentUrl}\n\n— ${companyName} Accounts Desk`;

    let delivered = false;
    let errorMsg: string | undefined;

    if (studentPhone.length >= 10 && isWaReady) {
      try {
        await sendWaMessage(studentPhone, message);
        delivered = true;
        sentCount++;
      } catch (err: any) {
        errorMsg = err?.message || 'WhatsApp send failed';
      }
    } else if (studentPhone.length >= 10) {
      // WhatsApp bot not connected, simulate/record queued
      delivered = false;
      errorMsg = isWaReady ? 'Invalid phone' : 'WhatsApp bot offline (queued for auto-send)';
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
    details = `WhatsApp bot is offline — no messages delivered. Reminders were generated for ${students.length} student(s) and payment links remain active; connect the bot on the Settings page and re-run.`;
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

  return runLog;
}

export async function reminderRoutes(app: FastifyInstance) {
  // Public Webhook hit by cron-job.org on schedule
  // Handles both GET and POST so cron-job.org standard GET monitor works out of the box!
  const handleCronTrigger = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
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
    const title = body.title || 'Monthly Student Fee Reminder (Seeds of Success)';
    const targetUrl =
      body.targetUrl || 'https://myfees.myenum.in/api/reminders/cron/monthly';
    const schedule = body.schedule || DEFAULT_SCHEDULE;

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

