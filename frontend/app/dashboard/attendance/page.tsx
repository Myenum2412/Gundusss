"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { EmptyState } from "@/components/empty-state"
import { LiveBadge } from "@/components/live-badge"
import Stats01 from "@/components/stats-01"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  entriesForDay,
  markStudents,
  todayIso,
} from "@/lib/attendance-utils"
import { isSyncing, sameJson } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import { CalendarCheckIcon, SearchIcon, UsersIcon } from "lucide-react"
import { cn } from "cn"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export default function AttendancePage() {
  const { can } = useAuth()
  const canWrite = can("data:write")

  const [students, setStudents] = useState<StoredStudent[]>([])
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [days, setDays] = useState<AttendanceDay[]>([])
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [selectedGroup, setSelectedGroup] = useState("all")
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

  const groupNames = useMemo(() => {
    const names = new Set<string>()
    for (const group of groups) {
      if (group.groupName) names.add(group.groupName)
    }
    for (const student of activeStudents) {
      if (student.group) names.add(student.group)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [groups, activeStudents])

  const visibleStudents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return activeStudents.filter((student) => {
      const matchesGroup =
        selectedGroup === "all" ||
        (selectedGroup === "__ungrouped"
          ? !(student.group ?? "").trim()
          : student.group === selectedGroup)
      const matchesQuery =
        !needle ||
        student.studentName.toLowerCase().includes(needle) ||
        student.studentId.toLowerCase().includes(needle) ||
        (student.group ?? "").toLowerCase().includes(needle)
      return matchesGroup && matchesQuery
    })
  }, [activeStudents, query, selectedGroup])

  const entryMap = useMemo(
    () => entriesForDay(days, selectedDate),
    [days, selectedDate]
  )

  const counts = useMemo(() => {
    let present = 0
    let absent = 0
    let late = 0
    for (const student of visibleStudents) {
      const status = entryMap.get(student.studentId)?.status
      if (status === "Present") present += 1
      else if (status === "Absent") absent += 1
      else if (status === "Late") late += 1
    }
    const total = visibleStudents.length
    return {
      present,
      absent,
      late,
      unmarked: total - present - absent - late,
      total,
      rate: total === 0 ? 0 : Math.round(((present + late) / total) * 100),
    }
  }, [visibleStudents, entryMap])

  const stats = [
    {
      name: "Present",
      value: String(counts.present),
      change: `${counts.rate}% attendance`,
      changeType: "positive" as const,
    },
    {
      name: "Absent",
      value: String(counts.absent),
      change: counts.total ? `${Math.round((counts.absent / counts.total) * 100)}% of ${counts.total}` : "No students",
      changeType: "negative" as const,
    },
    {
      name: "Late",
      value: String(counts.late),
      change: counts.total ? `${Math.round((counts.late / counts.total) * 100)}% of ${counts.total}` : "No students",
      changeType: "neutral" as const,
    },
    {
      name: "Unmarked",
      value: String(counts.unmarked),
      change: `${counts.total} student${counts.total === 1 ? "" : "s"}`,
      changeType: "neutral" as const,
    },
  ]

  function setStatus(student: StoredStudent, status: AttendanceStatus) {
    if (!canWrite) return
    const current = entryMap.get(student.studentId)?.status
    setDays((prev) =>
      markStudents(prev, selectedDate, [student], status, current === status)
    )
    setDirty(true)
  }

  function markVisible(status: AttendanceStatus) {
    if (!canWrite || visibleStudents.length === 0) return
    setDays((prev) =>
      markStudents(prev, selectedDate, visibleStudents, status)
    )
    setDirty(true)
  }

  return (
    <DashboardShell
      trail={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Attendance", href: "/dashboard/attendance" },
        { label: "Students" },
      ]}
    >
      <PageHeader
        title="Student Attendance"
        description="Mark Present, Absent, or Late. Absent sends a WhatsApp notice when connected; click again to clear."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {counts.total} shown
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
                onClick={() => markVisible(status)}
                disabled={visibleStudents.length === 0}
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
        <select
          aria-label="Filter by group"
          className={cn(selectClassName, "md:w-56")}
          value={selectedGroup}
          onChange={(event) => setSelectedGroup(event.target.value)}
        >
          <option value="all">All groups</option>
          {groupNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {activeStudents.some((student) => !(student.group ?? "").trim()) && (
            <option value="__ungrouped">Ungrouped</option>
          )}
        </select>
        <div className="relative md:ml-auto md:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search student or group"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="data-table-surface">
        <div className="data-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleStudents.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={activeStudents.length === 0 ? UsersIcon : SearchIcon}
                      title={
                        activeStudents.length === 0
                          ? "No students yet"
                          : "No matching students"
                      }
                      hint={
                        activeStudents.length === 0
                          ? "Add students on the Students page, then return here to mark attendance."
                          : "Try a different group or search term."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                visibleStudents.map((student) => {
                  const current = entryMap.get(student.studentId)?.status
                  return (
                    <TableRow key={student.studentId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                            {initials(student.studentName) || "ST"}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {student.studentName}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {student.studentId}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {student.group || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {student.course || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {ATTENDANCE_STATUSES.map((status) => {
                            const checked = current === status
                            return (
                              <label
                                key={status}
                                className={cn(
                                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                                  checked
                                    ? statusStyles[status].checked
                                    : "border-input bg-card text-muted-foreground hover:bg-muted",
                                  !canWrite && "cursor-not-allowed opacity-60"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className={cn(
                                    "size-3.5 shrink-0 rounded",
                                    statusStyles[status].accent
                                  )}
                                  checked={checked}
                                  disabled={!canWrite}
                                  onChange={() => setStatus(student, status)}
                                />
                                <span className="hidden sm:inline">{status}</span>
                                <span className="sm:hidden">{status[0]}</span>
                              </label>
                            )
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarCheckIcon className="size-3.5" />
        Showing attendance for {selectedDate}
        {selectedGroup !== "all" ? ` · ${selectedGroup}` : ""}
      </p>
    </DashboardShell>
  )
}
