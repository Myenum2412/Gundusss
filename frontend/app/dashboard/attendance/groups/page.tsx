"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { EmptyState } from "@/components/empty-state"
import { LiveBadge } from "@/components/live-badge"
import Stats01 from "@/components/stats-01"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import {
  isAttendanceSavePending,
  loadAttendance,
  saveAttendance,
  type AttendanceDay,
  type AttendanceStatus,
} from "@/lib/attendance-store"
import {
  ATTENDANCE_STATUSES,
  buildAttendanceGroups,
  entriesForDay,
  markStudents,
  todayIso,
  type AttendanceGroup,
} from "@/lib/attendance-utils"
import { isSyncing, sameJson } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import { CalendarCheckIcon, LayersIcon, SearchIcon, UsersIcon } from "lucide-react"
import { cn } from "cn"

const statusStyles: Record<
  AttendanceStatus,
  { checked: string; accent: string }
> = {
  Present: {
    checked:
      "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    accent: "accent-emerald-600",
  },
  Absent: {
    checked:
      "border-rose-600/30 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
    accent: "accent-rose-600",
  },
  Late: {
    checked:
      "border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400",
    accent: "accent-amber-500",
  },
}

function groupCounts(
  group: AttendanceGroup,
  entryMap: Map<string, { status: AttendanceStatus }>
) {
  let present = 0
  let absent = 0
  let late = 0
  for (const student of group.members) {
    const status = entryMap.get(student.studentId)?.status
    if (status === "Present") present += 1
    else if (status === "Absent") absent += 1
    else if (status === "Late") late += 1
  }
  const total = group.members.length
  return {
    present,
    absent,
    late,
    unmarked: total - present - absent - late,
    total,
    rate: total === 0 ? 0 : Math.round(((present + late) / total) * 100),
  }
}

export default function GroupAttendancePage() {
  const { can } = useAuth()
  const canWrite = can("data:write")

  const [students, setStudents] = useState<StoredStudent[]>([])
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [days, setDays] = useState<AttendanceDay[]>([])
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [query, setQuery] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const [dirty, setDirty] = useState(false)

  const reload = useCallback(() => {
    if (isSyncing() || isAttendanceSavePending()) return
    Promise.all([loadStudents(), loadGroups(), loadAttendance()])
      .then(([studentRows, groupRows, attendanceRows]) => {
        if (isSyncing() || isAttendanceSavePending()) return
        setStudents((prev) => (sameJson(prev, studentRows) ? prev : studentRows))
        setGroups((prev) => (sameJson(prev, groupRows) ? prev : groupRows))
        setDays((prev) => (sameJson(prev, attendanceRows) ? prev : attendanceRows))
        setHydrated(true)
      })
      .catch((error) => console.error("Failed to load attendance", error))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useLiveReload(reload)

  useEffect(() => {
    if (!hydrated || !dirty) return
    void saveAttendance(days).finally(() => setDirty(false))
  }, [days, hydrated, dirty])

  const activeStudents = useMemo(
    () => students.filter((student) => student.status !== "Inactive"),
    [students]
  )
  const attendanceGroups = useMemo(
    () => buildAttendanceGroups(groups, students),
    [groups, students]
  )
  const entryMap = useMemo(
    () => entriesForDay(days, selectedDate),
    [days, selectedDate]
  )

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return attendanceGroups.filter(
      (group) =>
        !needle ||
        group.groupName.toLowerCase().includes(needle) ||
        group.course.toLowerCase().includes(needle) ||
        group.batch.toLowerCase().includes(needle)
    )
  }, [attendanceGroups, query])

  const overall = useMemo(() => {
    let present = 0
    let absent = 0
    let late = 0
    for (const student of activeStudents) {
      const status = entryMap.get(student.studentId)?.status
      if (status === "Present") present += 1
      else if (status === "Absent") absent += 1
      else if (status === "Late") late += 1
    }
    const total = activeStudents.length
    return {
      present,
      absent,
      late,
      unmarked: total - present - absent - late,
      total,
      rate: total === 0 ? 0 : Math.round(((present + late) / total) * 100),
    }
  }, [activeStudents, entryMap])

  const stats = [
    {
      name: "Present",
      value: String(overall.present),
      change: `${overall.rate}% attendance`,
      changeType: "positive" as const,
    },
    {
      name: "Absent",
      value: String(overall.absent),
      change: overall.total ? `${Math.round((overall.absent / overall.total) * 100)}% of ${overall.total}` : "No students",
      changeType: "negative" as const,
    },
    {
      name: "Late",
      value: String(overall.late),
      change: overall.total ? `${Math.round((overall.late / overall.total) * 100)}% of ${overall.total}` : "No students",
      changeType: "neutral" as const,
    },
    {
      name: "Groups",
      value: String(attendanceGroups.length),
      change: `${overall.total} active students`,
      changeType: "neutral" as const,
    },
  ]

  function setGroupStatus(group: AttendanceGroup, status: AttendanceStatus) {
    if (!canWrite || group.members.length === 0) return
    const allSame = group.members.every(
      (student) => entryMap.get(student.studentId)?.status === status
    )
    setDays((prev) =>
      markStudents(prev, selectedDate, group.members, status, allSame)
    )
    setDirty(true)
  }

  function markAllVisible(status: AttendanceStatus) {
    const members = visibleGroups.flatMap((group) => group.members)
    if (!canWrite || members.length === 0) return
    setDays((prev) => markStudents(prev, selectedDate, members, status))
    setDirty(true)
  }

  return (
    <DashboardShell
      trail={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Attendance", href: "/dashboard/attendance" },
        { label: "Groups" },
      ]}
    >
      <PageHeader
        title="Group Attendance"
        description="Mark an entire class at once. Each checkbox updates every student in that group; Absent sends a WhatsApp notice to every member with a phone number when your WhatsApp session is connected."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {attendanceGroups.length} groups
            </span>
            <LiveBadge />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {ATTENDANCE_STATUSES.map((status) => (
              <Button
                key={status}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => markAllVisible(status)}
                disabled={visibleGroups.length === 0}
              >
                All {status.toLowerCase()}
              </Button>
            ))}
          </div>
        }
      />

      <Stats01 stats={stats} />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Attendance date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="w-auto"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(todayIso())}
          >
            Today
          </Button>
        </div>
        <div className="relative md:ml-auto md:w-80">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search group, course, or batch"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={attendanceGroups.length === 0 ? LayersIcon : SearchIcon}
            title={
              attendanceGroups.length === 0
                ? "No groups yet"
                : "No matching groups"
            }
            hint={
              attendanceGroups.length === 0
                ? "Create student groups on Students → Groups, then return here to mark group attendance."
                : "Try a different group, course, or batch."
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleGroups.map((group) => {
            const counts = groupCounts(group, entryMap)
            return (
              <div
                key={group.groupId}
                className="flex flex-col rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {group.groupName}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[group.course, group.batch].filter(Boolean).join(" · ") ||
                        "No course or batch"}
                    </p>
                  </div>
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border bg-muted/50 px-2 text-[11px] font-medium text-muted-foreground">
                    <UsersIcon className="size-3" />
                    {counts.total}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
                  {[
                    { label: "Present", value: counts.present, tone: "text-emerald-700 dark:text-emerald-400" },
                    { label: "Absent", value: counts.absent, tone: "text-rose-700 dark:text-rose-400" },
                    { label: "Late", value: counts.late, tone: "text-amber-700 dark:text-amber-400" },
                    { label: "Unmarked", value: counts.unmarked, tone: "text-muted-foreground" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-muted/40 px-1 py-1.5">
                      <div className={cn("text-sm font-semibold tabular-nums", item.tone)}>
                        {item.value}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                    style={{ width: `${counts.rate}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{counts.rate}% attendance</span>
                  <span>{counts.total - counts.unmarked} marked</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3">
                  <span className="mr-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Mark all
                  </span>
                  {ATTENDANCE_STATUSES.map((status) => {
                    const checked =
                      counts.total > 0 &&
                      group.members.every(
                        (student) =>
                          entryMap.get(student.studentId)?.status === status
                      )
                    return (
                      <label
                        key={status}
                        className={cn(
                          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                          checked
                            ? statusStyles[status].checked
                            : "border-input bg-card text-muted-foreground hover:bg-muted",
                          (!canWrite || counts.total === 0) &&
                            "cursor-not-allowed opacity-60"
                        )}
                      >
                        <input
                          type="checkbox"
                          className={cn(
                            "size-3.5 shrink-0 rounded",
                            statusStyles[status].accent
                          )}
                          checked={checked}
                          disabled={!canWrite || counts.total === 0}
                          onChange={() => setGroupStatus(group, status)}
                        />
                        {status}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarCheckIcon className="size-3.5" />
        Showing group attendance for {selectedDate}
      </p>
    </DashboardShell>
  )
}
