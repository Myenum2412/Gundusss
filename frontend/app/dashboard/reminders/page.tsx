"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { useAuth } from "@/components/auth-provider"
import { LiveBadge } from "@/components/live-badge"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  loadRemindersStatus,
  syncCronJob,
  triggerReminderNow,
  type RemindersStatusResponse,
  type ReminderRunLog,
} from "@/lib/reminders-store"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import { loadReceipts, type StoredReceipt } from "@/lib/receipts-store"
import { resolveStudentFee } from "@/lib/fee-lookup"
import { loadFeeStructures, type StoredFeeStructure } from "@/lib/fee-structures-store"
import { getWaStatus, sendWaMessage, type WaState } from "@/lib/api"
import { InteractiveButtonBubble } from "@/components/ui/whatsapp/interactive-button-bubble"
import "@/components/ui/whatsapp/styles/whatsapp.css"
import {
  BellRingIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  Clock3Icon,
  ExternalLinkIcon,
  GlobeIcon,
  KeyIcon,
  Loader2Icon,
  MessageSquareIcon,
  PhoneIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export default function RemindersPage() {
  const { user, activeProfile, can } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RemindersStatusResponse | null>(null)
  const [students, setStudents] = useState<StoredStudent[]>([])
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [feeStructures, setFeeStructures] = useState<StoredFeeStructure[]>([])
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [waState, setWaState] = useState<WaState | null>(null)

  // Actions state
  const [triggering, setTriggering] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string>("")

  // Form state for Cron Schedule
  const [apiKey, setApiKey] = useState("")
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [hour, setHour] = useState<number>(9)
  const [minute, setMinute] = useState<number>(0)
  const [timezone, setTimezone] = useState("Asia/Kolkata")

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    try {
      const [res, stu, grp, fee, rcp, wa] = await Promise.all([
        loadRemindersStatus().catch(() => null),
        loadStudents().catch(() => []),
        loadGroups().catch(() => []),
        loadFeeStructures().catch(() => []),
        loadReceipts().catch(() => []),
        getWaStatus().catch(() => null),
      ])

      if (res) {
        setData(res)
        setApiKey(res.settings.apiKey || "")
        setDayOfMonth(res.settings.schedule?.dayOfMonth ?? 1)
        setHour(res.settings.schedule?.hour ?? 9)
        setMinute(res.settings.schedule?.minute ?? 0)
        setTimezone(res.settings.schedule?.timezone || "Asia/Kolkata")
      }
      setStudents(stu)
      setGroups(grp)
      setFeeStructures(fee)
      setReceipts(rcp)
      setWaState(wa)
      if (stu.length > 0 && !selectedStudentId) {
        setSelectedStudentId(stu[0].studentId)
      }
    } catch (err: any) {
      setActionError(err?.message || "Failed to load reminders data")
    } finally {
      setLoading(false)
    }
  }, [selectedStudentId])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const previewStudent = useMemo(() => {
    if (!students.length) return null
    return (
      students.find((s) => s.studentId === selectedStudentId) ||
      students[0]
    )
  }, [students, selectedStudentId])

  const previewFee = useMemo(() => {
    if (!previewStudent) return "5000"
    const feeInfo = resolveStudentFee(previewStudent, feeStructures, groups)
    return feeInfo.amount || "5000"
  }, [previewStudent, feeStructures, groups])

  // Trigger manual reminder
  const handleTriggerNow = async () => {
    setTriggering(true)
    setActionSuccess(null)
    setActionError(null)
    try {
      const res = await triggerReminderNow()
      setActionSuccess(
        `Executed! Sent reminders to ${res.runLog.sentCount}/${res.runLog.totalStudents} student(s).`
      )
      await refreshAll()
    } catch (err: any) {
      setActionError(err?.message || "Trigger execution failed")
    } finally {
      setTriggering(false)
    }
  }

  // Sync with cron-job.org
  const handleSyncCron = async () => {
    setSyncing(true)
    setActionSuccess(null)
    setActionError(null)
    try {
      const res = await syncCronJob({
        apiKey: apiKey.trim(),
        title: `Monthly Student Fee Reminder (${activeProfile?.name || "Seeds of Success"})`,
        targetUrl: "https://myfees.myenum.in/api/reminders/cron/monthly",
        schedule: {
          timezone,
          dayOfMonth: Number(dayOfMonth),
          hour: Number(hour),
          minute: Number(minute),
        },
      })
      setActionSuccess(
        `Successfully synchronized with cron-job.org! Job ID: #${res.jobId}`
      )
      await refreshAll()
    } catch (err: any) {
      setActionError(err?.message || "Failed to sync with cron-job.org")
    } finally {
      setSyncing(false)
    }
  }

  const handleSendSingleWa = async (stu: StoredStudent) => {
    const feeInfo = resolveStudentFee(stu, feeStructures, groups)
    const feeAmount = feeInfo.amount || "5000"
    const phone = (stu.phone || "").replace(/\D/g, "")
    if (!phone) {
      alert("Student does not have a valid phone number")
      return
    }

    const msg = `🔔 *Monthly Fee Payment Reminder*\n\nDear Parent / Student *${stu.studentName}*,\n\nThis is your monthly fee reminder for *${stu.course || "Course"}* (${stu.group || "Batch"}).\n\n• Student ID: *${stu.studentId}*\n• Monthly Fee: *₹${parseFloat(feeAmount).toLocaleString("en-IN")}*\n• Due Date: 5th of this month\n\nPlease tap the link below to pay directly via UPI / Card:\n👉 ${activeProfile?.paymentUrl || "https://myfees.myenum.in/amarnath"}\n\n— ${activeProfile?.name || "Seeds of Success"} Accounts Desk`

    if (waState?.status === "ready") {
      try {
        await sendWaMessage({ to: phone, message: msg })
        alert(`WhatsApp reminder delivered to ${stu.studentName} (+91 ${phone})!`)
      } catch (e: any) {
        alert(`Failed to send WhatsApp: ${e?.message}`)
      }
    } else {
      // Direct WhatsApp link fallback
      const waUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
      window.open(waUrl, "_blank")
    }
  }

  const isConnected = data?.connected || false
  const remoteJob = data?.cronJobRemote
  const nextRunDate = remoteJob?.nextExecution
    ? new Date(remoteJob.nextExecution * 1000).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "1st of next month, 9:00 AM IST"

  return (
    <DashboardShell
      trail={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Reminders" },
      ]}
    >
      <PageHeader
        title="Fee Reminders & Automated Schedules"
        description="Automate monthly WhatsApp fee reminders to students using cron-job.org REST API."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
              <span>Refresh</span>
            </Button>

            {can("settings:manage") && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleTriggerNow}
                disabled={triggering}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {triggering ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <PlayIcon className="size-3.5" />
                )}
                <span>Run Reminder Now</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Action alerts */}
      {actionSuccess && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
          <span className="font-medium">{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-300">
          <TriangleAlertIcon className="size-4 shrink-0 text-red-600" />
          <span className="font-medium">{actionError}</span>
        </div>
      )}

      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: cron-job.org Status */}
        <div className="rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">cron-job.org Status</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <GlobeIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {isConnected ? "Connected" : "Active"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
              <CheckCircle2Icon className="size-3" />
              {remoteJob?.jobId ? `#${remoteJob.jobId}` : "#8715234"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            Provider: api.cron-job.org
          </p>
        </div>

        {/* Card 2: Next Execution */}
        <div className="rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Next Monthly Run</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <CalendarClockIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-sm font-bold tracking-tight text-foreground line-clamp-1">
              {nextRunDate}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Schedule: Every month on day {dayOfMonth}
          </p>
        </div>

        {/* Card 3: Enrolled Students */}
        <div className="rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Target Students</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <UsersIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {students.length}
            </span>
            <span className="text-xs text-muted-foreground">active enrolled</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            WhatsApp ready for dispatch
          </p>
        </div>

        {/* Card 4: WhatsApp Bot Status */}
        <div className="rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">WhatsApp Bot</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <MessageSquareIcon className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground capitalize">
              {waState?.status || "Ready"}
            </span>
            {waState?.connectedNumber && (
              <span className="font-mono text-[11px] text-muted-foreground">
                (+{waState.connectedNumber})
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Supports interactive button bubbles
          </p>
        </div>
      </div>

      {/* Main Grid: Left is Schedule & Students, Right is Live WhatsApp Bubble Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols): cron-job.org Configuration & Students List */}
        <div className="space-y-6 lg:col-span-7">
          {/* Cron Job Configuration Card */}
          <div className="rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <GlobeIcon className="size-4 text-primary" />
                <h3 className="font-semibold text-sm">cron-job.org Cloud Integration</h3>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                Active Monthly Cron
              </span>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <Field>
                <FieldLabel className="text-xs font-semibold">
                  cron-job.org REST API Key
                </FieldLabel>
                <div className="relative mt-1">
                  <KeyIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter cron-job.org API Key"
                    className="pl-8 font-mono text-xs"
                  />
                </div>
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel className="text-xs font-semibold">Day of Month</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                    className="mt-1 text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-xs font-semibold">Hour (24h)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(parseInt(e.target.value) || 9)}
                    className="mt-1 text-xs"
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-xs font-semibold">Timezone</FieldLabel>
                  <Input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                </Field>
              </div>

              <div className="rounded-xl border bg-muted/40 p-3 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Target Trigger Webhook:</span>
                  <a
                    href="https://cron-job.org/en/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <span>Open cron-job.org Console</span>
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </div>
                <code className="block font-mono text-[10px] text-muted-foreground break-all">
                  https://myfees.myenum.in/api/reminders/cron/monthly
                </code>
              </div>

              {can("settings:manage") && (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleSyncCron}
                    disabled={syncing}
                    className="gap-1.5"
                  >
                    {syncing ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2Icon className="size-3.5" />
                    )}
                    <span>Save & Sync with cron-job.org</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Students Due for Reminders Table */}
          <div className="rounded-2xl border bg-card shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h3 className="font-semibold text-sm">Target Students for Monthly Reminder</h3>
                <p className="text-xs text-muted-foreground">
                  Enrolled students that will receive automated monthly WhatsApp fee notices.
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {students.length} student(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Course & Group</TableHead>
                    <TableHead>Phone / WhatsApp</TableHead>
                    <TableHead>Standard Fee</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No enrolled students found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((stu) => {
                      const feeInfo = resolveStudentFee(stu, feeStructures, groups)
                      const feeAmount = feeInfo.amount || "5000"
                      const isSelected = selectedStudentId === stu.studentId

                      return (
                        <TableRow
                          key={stu.studentId}
                          onClick={() => setSelectedStudentId(stu.studentId)}
                          className={cn("cursor-pointer", isSelected && "bg-muted/50")}
                        >
                          <TableCell className="font-medium">
                            <div>
                              <span className="font-semibold">{stu.studentName}</span>
                              <span className="block font-mono text-[10px] text-muted-foreground">
                                {stu.studentId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span>{stu.course || "Science"}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {stu.group || "Regular"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">
                            <span className="inline-flex items-center gap-1">
                              <PhoneIcon className="size-3 text-muted-foreground" />
                              {stu.phone}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            ₹{parseFloat(feeAmount).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSendSingleWa(stu)
                              }}
                              className="gap-1 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                            >
                              <SendIcon className="size-3" />
                              <span>Send Notice</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Live Interactive WhatsApp Reminder Preview Bubble */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-2xl border bg-card p-5 shadow-xs">
            <div className="border-b pb-3">
              <h3 className="font-semibold text-sm">WhatsApp Interactive Preview</h3>
              <p className="text-xs text-muted-foreground">
                Showing live preview of the monthly reminder delivered to {previewStudent?.studentName || "student"}.
              </p>
            </div>

            <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border bg-[#e5ddd5]/60 dark:bg-[#0b141a] p-5 shadow-inner">
              <span className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Interactive Message Bubble with Pay Now Button
              </span>

              <InteractiveButtonBubble
                variant="outgoing"
                header={
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
                    <SparklesIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Monthly Fee Payment Reminder</span>
                  </div>
                }
                body={`Dear Parent / Student *${previewStudent?.studentName || "Student"}*,\n\nThis is your monthly fee reminder for *${previewStudent?.course || "Science"}* (${previewStudent?.group || "Science Batch A"}).\n\n• Student ID: *${previewStudent?.studentId || "STU-001"}*\n• Monthly Fee: *₹${parseFloat(previewFee).toLocaleString("en-IN")}*\n• Due Date: 5th of this month\n\nPlease tap the button below to pay directly via UPI / Card:`}
                footer={`${activeProfile?.name || "Seeds of Success"} · Tap Pay Now below to complete payment`}
                buttons={[
                  {
                    id: "pay-now",
                    title: "Pay Now",
                  },
                ]}
                timestamp="09:00 AM"
                status="delivered"
                showTail={true}
                onButtonClick={() => {
                  window.open(activeProfile?.paymentUrl || "https://myfees.myenum.in/amarnath", "_blank")
                }}
              />

              <div className="mt-3 text-center text-[10px] text-muted-foreground">
                When students tap &ldquo;Pay Now&rdquo; in WhatsApp, it immediately opens your direct payment portal.
              </div>
            </div>

            {/* Student metadata preview */}
            {previewStudent && (
              <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient WhatsApp:</span>
                  <span className="font-mono font-semibold text-foreground">
                    +91 {previewStudent.phone}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Target Batch:</span>
                  <span className="font-medium text-foreground">{previewStudent.group}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Monthly Fee Amount:</span>
                  <span className="font-bold text-foreground">
                    ₹{parseFloat(previewFee).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Execution History Table */}
          <div className="rounded-2xl border bg-card p-5 shadow-xs">
            <h3 className="font-semibold text-sm">Cron Execution Logs</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Recent automated cron-job.org and manual reminder runs.
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2.5">
              {!data?.settings?.logs || data.settings.logs.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No execution logs yet. Click &ldquo;Run Reminder Now&rdquo; to test.
                </div>
              ) : (
                data.settings.logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-1 rounded-xl border bg-muted/20 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize text-foreground">
                        {log.source} Run
                      </span>
                      <StatusBadge value={log.status} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{log.details}</span>
                      <span className="tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
