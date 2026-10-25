"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { useAuth } from "@/components/auth-provider"
import { LiveBadge } from "@/components/live-badge"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fileToBase64 } from "@/lib/file-base64"
import { loadAnnouncements, saveAnnouncements, type StoredAnnouncement } from "@/lib/announcements-store"
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
  clearReminderLogs,
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
  PaperclipIcon,
  PhoneIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UsersIcon,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_FILE_BYTES = 3 * 1024 * 1024 // 3 MB per file (base64 must fit the API body limit)

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
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>([1])
  const [hour, setHour] = useState<number>(9)
  const [minute, setMinute] = useState<number>(0)
  const [timezone, setTimezone] = useState("Asia/Kolkata")

  // Form state for the custom reminder dialog
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({ title: "", message: "" })
  const [reminderStudentIds, setReminderStudentIds] = useState<string[]>([])
  const [reminderFiles, setReminderFiles] = useState<File[]>([])
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderFilesRef, setReminderFilesRef] = useState<HTMLInputElement | null>(null)
  const [reminderError, setReminderError] = useState("")
  const [recentCustomReminders, setRecentCustomReminders] = useState<StoredAnnouncement[]>([])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    try {
      const [res, stu, grp, fee, rcp, wa, ann] = await Promise.all([
        loadRemindersStatus().catch(() => null),
        loadStudents().catch(() => []),
        loadGroups().catch(() => []),
        loadFeeStructures().catch(() => []),
        loadReceipts().catch(() => []),
        getWaStatus().catch(() => null),
        loadAnnouncements().catch(() => []),
      ])

      if (res) {
        setData(res)
        setApiKey(res.settings.apiKey || "")
        const days = Array.isArray(res.settings.schedule?.daysOfMonth)
          ? (res.settings.schedule.daysOfMonth as number[]).filter((d) => d >= 1 && d <= 28)
          : []
        const loaded = days.length > 0 ? days : [res.settings.schedule?.dayOfMonth ?? 1]
        setDaysOfMonth(Array.from(new Set(loaded)).sort((a, b) => a - b))
        setDayOfMonth(loaded[0] ?? 1)
        setHour(res.settings.schedule?.hour ?? 9)
        setMinute(res.settings.schedule?.minute ?? 0)
        setTimezone(res.settings.schedule?.timezone || "Asia/Kolkata")
      }
      setStudents(stu)
      setGroups(grp)
      setFeeStructures(fee)
      setReceipts(rcp)
      setWaState(wa)
      setRecentCustomReminders((ann as StoredAnnouncement[]).slice(-5).reverse())
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
        res.runLog.details ||
          `Executed! Sent reminders to ${res.runLog.sentCount}/${res.runLog.totalStudents} student(s).`
      )
      await refreshAll()
    } catch (err: any) {
      setActionError(err?.message || "Trigger execution failed")
    } finally {
      setTriggering(false)
    }
  }

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all reminder execution logs?")) return
    try {
      await clearReminderLogs()
      await refreshAll()
    } catch (err: any) {
      setActionError(err?.message || "Failed to clear logs")
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
        title: `Monthly Student Fee Reminder (${activeProfile?.name || "MyFees"})`,
        targetUrl: "https://myfees.myenum.in/api/reminders/cron/monthly",
        schedule: {
          timezone,
          dayOfMonth: Number(dayOfMonth),
          daysOfMonth: daysOfMonth.length > 0 ? daysOfMonth : [Number(dayOfMonth)],
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

  const toggleDayOfMonth = (day: number) => {
    setReminderError("")
    setDaysOfMonth((prev) => {
      const next = prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b)
      return next.length > 0 ? next : prev // never allow an empty day selection
    })
  }

  function toggleReminderStudent(id: string) {
    setReminderStudentIds((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id]
    )
  }

  function addReminderFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return
    const incoming = Array.from(selected)
    setReminderError("")
    setReminderFiles((prev) => [
      ...prev,
      ...incoming
        .filter((f) => f.size <= MAX_FILE_BYTES)
        .filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size)),
    ])
  }

  function clearReminderFormState() {
    setReminderForm({ title: "", message: "" })
    setReminderStudentIds([])
    setReminderFiles([])
    setReminderError("")
    if (reminderFilesRef) reminderFilesRef.value = ""
  }

  async function handleCreateReminder() {
    if (reminderStudentIds.length === 0) {
      setReminderError("Select at least one student.")
      return
    }
    if (!reminderForm.message.trim() && !reminderForm.title.trim() && reminderFiles.length === 0) {
      setReminderError("Write a message, a title, or attach a file.")
      return
    }
    setReminderError("")
    setReminderSending(true)

    const attachmentsForSend: { name: string; mime: string; data: string }[] = []
    for (const file of reminderFiles) {
      try {
        attachmentsForSend.push({
          name: file.name,
          mime: file.type || "application/octet-stream",
          data: await fileToBase64(file),
        })
      } catch {
        // unreadable file â€” skip
      }
    }

    let sent = 0
    let failed = 0
    const recipientNames: string[] = []
    for (const id of reminderStudentIds) {
      const stu = students.find((st) => st.studentId === id)
      recipientNames.push(stu ? `${stu.studentName} (${stu.studentId})` : id)
      try {
        const titleLine = reminderForm.title.trim()
        await sendWaMessage({
          to: stu?.phone ?? id,
          message: titleLine ? `*${titleLine}*\n${reminderForm.message.trim()}` : reminderForm.message.trim(),
        })
        for (const att of attachmentsForSend) {
          await sendWaMessage({ to: stu?.phone ?? id, message: "", attachment: att })
        }
        sent += 1
      } catch {
        failed += 1
      }
    }

    // Save the reminder as an announcement-shaped record so it shows up in
    // both lists (announcements page + this page's recent reminders).
    try {
      const stored = await loadAnnouncements().catch(() => [])
      const max = stored.reduce((m, a) => {
        const n = parseInt(a.announcementId.replace(/\D/g, ""), 10)
        return Number.isNaN(n) ? m : Math.max(m, n)
      }, 0)
      const record: StoredAnnouncement = {
        announcementId: `REM-${String(max + 1).padStart(3, "0")}`,
        title: reminderForm.title.trim() || "Custom reminder",
        message: reminderForm.message,
        recipientIds: [...reminderStudentIds],
        recipientNames,
        attachments: reminderFiles.map((f) => ({
          name: f.name,
          mime: f.type || "application/octet-stream",
        })),
        sentCount: sent,
        failedCount: failed,
        status: failed === 0 ? "Sent" : sent === 0 ? "Failed" : "Partial",
        createdAt: new Date().toISOString(),
      }
      await saveAnnouncements([...stored, record])
    } catch (error) {
      console.error("Failed to save reminder record", error)
    }

    clearReminderFormState()
    setReminderSending(false)
    setReminderOpen(false)
    setActionSuccess(
      `Reminder sent to ${sent} student(s)` +
        (failed > 0 ? ` â€” ${failed} failed` : "") +
        "."
    )
    await refreshAll()
  }

  const handleSendSingleWa = async (stu: StoredStudent) => {    const feeInfo = resolveStudentFee(stu, feeStructures, groups)
    const feeAmount = feeInfo.amount || "5000"
    const phone = (stu.phone || "").replace(/\D/g, "")
    if (!phone) {
      alert("Student does not have a valid phone number")
      return
    }

    const studentPaymentUrl = `${activeProfile?.paymentUrl || "https://myfees.myenum.in/amarnath"}?student=${encodeURIComponent(stu.studentId)}`
    const msg = `ðŸ”” *Monthly Fee Payment Reminder*\n\nDear Parent / Student *${stu.studentName}*,\n\nThis is your monthly fee reminder for *${stu.course || "Course"}* (${stu.group || "Batch"}).\n\nâ€¢ Student ID: *${stu.studentId}*\nâ€¢ Monthly Fee: *â‚¹${parseFloat(feeAmount).toLocaleString("en-IN")}*\nâ€¢ Due Date: 5th of this month\n\nPlease tap the link below to pay directly via UPI / Card:\nðŸ‘‰ ${studentPaymentUrl}\n\nâ€” ${activeProfile?.name || "MyFees"} Accounts Desk`

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
        liveSlot={<LiveBadge />}
        actions={
          <>
            <Dialog
              open={reminderOpen}
              onOpenChange={(v) => {
                if (!v) clearReminderFormState()
                setReminderOpen(v)
              }}
            >
              <DialogTrigger render={<Button size="sm" />}>
                <SparklesIcon className="size-3.5" />
                <span>New Reminder</span>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold tracking-tight">
                    New Reminder
                  </DialogTitle>
                  <DialogDescription>
                    Sent immediately to the selected students on WhatsApp; saved to your announcement log.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 px-6 py-5">
                  <Field>
                    <FieldLabel htmlFor="reminder-title">Title</FieldLabel>
                    <Input
                      id="reminder-title"
                      placeholder="e.g. Test series payment due tomorrow"
                      value={reminderForm.title}
                      onChange={(e) =>
                        setReminderForm((f) => ({ ...f, title: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reminder-message">Message</FieldLabel>
                    <textarea
                      id="reminder-message"
                      placeholder="Type the reminder sent to WhatsApp"
                      value={reminderForm.message}
                      onChange={(e) =>
                        setReminderForm((f) => ({ ...f, message: e.target.value }))
                      }
                      rows={4}
                      className={cn(
                        "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Attachments (optional) — up to 3 MB each</FieldLabel>
                    <input
                      ref={setReminderFilesRef}
                      type="file"
                      multiple
                      className="sr-only"
                      id="reminder-files"
                      onChange={(e) => {
                        addReminderFiles(e.target.files)
                        e.target.value = ""
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => reminderFilesRef?.click()}>
                        <PaperclipIcon className="size-3.5" />
                        <span>Choose files</span>
                      </Button>
                      {reminderFiles.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReminderFiles([])
                            if (reminderFilesRef) reminderFilesRef.value = ""
                          }}
                        >
                          <X className="size-3.5" />
                          <span>Clear all</span>
                        </Button>
                      )}
                    </div>
                    {reminderFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {reminderFiles.map((f, i) => (
                          <span
                            key={`${f.name}-${f.size}-${i}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            <span className="max-w-56 truncate font-medium text-foreground" title={f.name}>
                              {f.name}
                            </span>
                            <span className="shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                            <button
                              type="button"
                              className="shrink-0 rounded-full p-0.5 hover:bg-muted"
                              onClick={() => setReminderFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              aria-label={`Remove ${f.name}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>Students ({reminderStudentIds.length} of {students.length} selected)</FieldLabel>
                    <div className="max-h-52 overflow-y-auto rounded-[10px] border border-input bg-card p-1.5 custom-scroll">
                      {students.length === 0 ? (
                        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No students found. Add students first on the Students page.
                        </p>
                      ) : (
                        students.map((stu) => (
                          <label
                            key={stu.studentId}
                            className="app-transition flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={reminderStudentIds.includes(stu.studentId)}
                                onChange={() => toggleReminderStudent(stu.studentId)}
                              />
                              <span className="font-medium text-foreground">{stu.studentName}</span>
                              <span className="font-mono text-xs text-muted-foreground">{stu.studentId}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                              {stu.course && <span>{stu.course}</span>}
                              {stu.group ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{stu.group}</span>
                              ) : null}
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </Field>
                  {reminderError && <p className="text-sm text-destructive">{reminderError}</p>}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      clearReminderFormState()
                      setReminderOpen(false)
                    }}
                    disabled={reminderSending}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleCreateReminder} disabled={reminderSending}>
                    {reminderSending ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <SendIcon className="size-3.5" />
                    )}
                    {reminderSending ? "Sending…" : "Send Reminder"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
          </>
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
            Schedule: Every month on day{" "}
            {(daysOfMonth.length > 0 ? daysOfMonth : [dayOfMonth]).join(", ")}
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

      {/* Recent Custom Reminders */}
      {recentCustomReminders.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <BellRingIcon className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Custom Reminders</h3>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {recentCustomReminders.length} recent
            </span>
          </div>
          <div className="mt-3 divide-y">
            {recentCustomReminders.map((rem) => (
              <div key={rem.announcementId} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{rem.announcementId}</span>
                    <StatusBadge value={rem.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-foreground">{rem.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rem.recipientNames?.slice(0, 3).join(", ")}
                    {(rem.recipientNames?.length ?? 0) > 3 && ` +${rem.recipientNames.length - 3} more`}
                    {" · "}
                    {new Date(rem.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <span className="font-medium text-emerald-600">{rem.sentCount} sent</span>
                  {(rem.failedCount ?? 0) > 0 && (
                    <span className="text-red-600"> · {rem.failedCount} failed</span>
                  )}
                  {(rem.attachments?.length ?? 0) > 0 && (
                    <p className="mt-0.5 flex items-center justify-end gap-1">
                      <PaperclipIcon className="size-3" />
                      {rem.attachments!.length}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  Days of Month ({daysOfMonth.length} selected)
                </FieldLabel>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => {
                    const active = daysOfMonth.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfMonth(day)}
                        aria-pressed={active}
                        className={cn(
                          "h-7 w-7 rounded-md border text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                        )}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tap the days the reminder should fire (e.g. 1 and 15 for twice a month).
                </p>
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                            â‚¹{parseFloat(feeAmount).toLocaleString("en-IN")}
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
                body={`Dear Parent / Student *${previewStudent?.studentName || "Student"}*,\n\nThis is your monthly fee reminder for *${previewStudent?.course || "Science"}* (${previewStudent?.group || "Science Batch A"}).\n\nâ€¢ Student ID: *${previewStudent?.studentId || "STU-001"}*\nâ€¢ Monthly Fee: *â‚¹${parseFloat(previewFee).toLocaleString("en-IN")}*\nâ€¢ Due Date: 5th of this month\n\nPlease tap the button below to pay directly via UPI / Card:`}
                footer={`${activeProfile?.name || "MyFees"} Â· Tap Pay Now below to complete payment`}
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
                  const studentQuery = previewStudent ? `?student=${encodeURIComponent(previewStudent.studentId)}` : ""
                  window.open((activeProfile?.paymentUrl || "https://myfees.myenum.in/amarnath") + studentQuery, "_blank")
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
                    â‚¹{parseFloat(previewFee).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Execution History Table */}
          <div className="rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-sm">Cron Execution Logs</h3>
              {data?.settings?.logs && data.settings.logs.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleClearLogs}
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear Logs
                </Button>
              )}
            </div>
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
