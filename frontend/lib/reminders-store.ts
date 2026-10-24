import { apiFetch } from "./api-base"

export interface CronScheduleConfig {
  timezone: string
  hour: number
  minute: number
  dayOfMonth: number
}

export interface ReminderRecipient {
  studentId: string
  studentName: string
  phone: string
  amount: string
  delivered: boolean
  error?: string
}

export interface ReminderRunLog {
  id: string
  timestamp: string
  jobId?: number
  source: "cron-job.org" | "manual" | "scheduled"
  totalStudents: number
  sentCount: number
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED"
  details: string
  recipients: ReminderRecipient[]
}

export interface StoredReminderSettings {
  apiKey: string
  enabled: boolean
  jobId: number | null
  targetUrl: string
  title: string
  schedule: CronScheduleConfig
  lastRun: string | null
  lastStatus: string | null
  logs: ReminderRunLog[]
}

export interface RemoteCronJob {
  jobId: number
  enabled: boolean
  title: string
  saveResponses: boolean
  url: string
  lastStatus: number
  lastDuration: number
  lastExecution: number
  nextExecution: number
  schedule: {
    timezone: string
    hours: number[]
    mdays: number[]
    minutes: number[]
    months: number[]
    wdays: number[]
    expiresAt: number
  }
}

export interface RemindersStatusResponse {
  settings: StoredReminderSettings
  cronJobRemote: RemoteCronJob | null
  cronJobError: string | null
  connected: boolean
}

export async function loadRemindersStatus(): Promise<RemindersStatusResponse> {
  const res = await apiFetch("/api/reminders/status")
  if (!res.ok) {
    throw new Error(`Failed to load reminders status (${res.status})`)
  }
  const json = await res.json()
  return json.data
}

export async function syncCronJob(options: {
  apiKey?: string
  title?: string
  targetUrl?: string
  schedule?: CronScheduleConfig
}): Promise<{ success: boolean; jobId: number; settings: StoredReminderSettings }> {
  const res = await apiFetch("/api/reminders/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.details || err.error || "Failed to sync cron job")
  }
  const json = await res.json()
  return json.data
}

export async function triggerReminderNow(): Promise<{
  success: boolean
  runLog: ReminderRunLog
  settings: StoredReminderSettings
}> {
  const res = await apiFetch("/api/reminders/trigger", {
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.details || err.error || "Failed to trigger reminders")
  }
  const json = await res.json()
  return json.data
}

export async function deleteCronJob(jobId: number): Promise<boolean> {
  const res = await apiFetch(`/api/reminders/job/${jobId}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.details || err.error || "Failed to delete cron job")
  }
  return true
}
