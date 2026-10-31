"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import Stats01 from "@/components/stats-01"
import { EmptyState } from "@/components/empty-state"
import { LiveBadge } from "@/components/live-badge"
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
import { loadAttendance, type AttendanceDay } from "@/lib/attendance-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import {
  loadFeeStructures,
  type StoredFeeStructure,
} from "@/lib/fee-structures-store"
import { loadReceipts, type StoredReceipt } from "@/lib/receipts-store"
import {
  buildStudentPerformance,
  summarizePerformance,
  type FeeStatus,
  type PerformanceLabel,
} from "@/lib/student-performance"
import { isSyncing, sameJson } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import { cn } from "cn"
import { BarChart3Icon, SearchIcon } from "lucide-react"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const performanceStyles: Record<PerformanceLabel, string> = {
  Excellent:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400",
  Good: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-400",
  "Needs attention":
    "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-400",
  "No data": "bg-muted text-muted-foreground ring-border",
}

const feeStyles: Record<FeeStatus, string> = {
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400",
  Partial:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400",
  Unpaid:
    "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-400",
  "No fee": "bg-muted text-muted-foreground ring-border",
}

function inr(value: number) {
  return `\u20B9${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function attendanceLabel(rate: number | null) {
  return rate === null ? "—" : `${rate}%`
}

function barClass(rate: number | null) {
  if (rate === null) return "bg-muted-foreground/25"
  if (rate >= 90) return "bg-emerald-500"
  if (rate >= 75) return "bg-sky-500"
  return "bg-rose-500"
}

function rateClass(rate: number | null) {
  if (rate === null) return "text-muted-foreground"
  if (rate >= 90) return "text-emerald-700 dark:text-emerald-400"
  if (rate >= 75) return "text-sky-700 dark:text-sky-400"
  return "text-rose-700 dark:text-rose-400"
}

export default function ReportsPage() {
  const [students, setStudents] = useState<StoredStudent[]>([])
  const [attendance, setAttendance] = useState<AttendanceDay[]>([])
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [feeStructures, setFeeStructures] = useState<StoredFeeStructure[]>([])
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [query, setQuery] = useState("")
  const [groupFilter, setGroupFilter] = useState("all")
  const [performanceFilter, setPerformanceFilter] = useState("all")
  const [sortBy, setSortBy] = useState("lowest")

  const reload = useCallback(() => {
    if (isSyncing()) return
    Promise.all([
      loadStudents(),
      loadAttendance(),
      loadGroups(),
      loadFeeStructures(),
      loadReceipts(),
    ])
      .then(([nextStudents, nextAttendance, nextGroups, nextFees, nextReceipts]) => {
        if (isSyncing()) return
        setStudents((prev) => (sameJson(prev, nextStudents) ? prev : nextStudents))
        setAttendance((prev) =>
          sameJson(prev, nextAttendance) ? prev : nextAttendance
        )
        setGroups((prev) => (sameJson(prev, nextGroups) ? prev : nextGroups))
        setFeeStructures((prev) =>
          sameJson(prev, nextFees) ? prev : nextFees
        )
        setReceipts((prev) =>
          sameJson(prev, nextReceipts) ? prev : nextReceipts
        )
        setHydrated(true)
      })
      .catch((error) => {
        console.error("Failed to load student performance", error)
        setHydrated(true)
      })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useLiveReload(reload)

  const rows = useMemo(
    () =>
      buildStudentPerformance(
        students,
        attendance,
        groups,
        feeStructures,
        receipts
      ),
    [students, attendance, groups, feeStructures, receipts]
  )
  const summary = useMemo(() => summarizePerformance(rows), [rows])

  const groupOptions = useMemo(() => {
    const names = new Set<string>()
    for (const student of students) {
      const group = (student.group ?? "").trim()
      if (group) names.add(group)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [students])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      const student = row.student
      const matchesQuery =
        !needle ||
        [
          student.studentName,
          student.studentId,
          student.group,
          student.course,
        ].some((value) => (value ?? "").toLowerCase().includes(needle))

      const group = (student.group ?? "").trim()
      const matchesGroup =
        groupFilter === "all" ||
        (groupFilter === "__ungrouped" ? !group : group === groupFilter)
      const matchesPerformance =
        performanceFilter === "all" ||
        row.performance === performanceFilter

      return matchesQuery && matchesGroup && matchesPerformance
    })
  }, [rows, query, groupFilter, performanceFilter])

  const visibleRows = useMemo(() => {
    const sorted = [...filteredRows]
    if (sortBy === "name") {
      sorted.sort((a, b) =>
        a.student.studentName.localeCompare(b.student.studentName)
      )
      return sorted
    }

    sorted.sort((a, b) => {
      const left = a.attendanceRate
      const right = b.attendanceRate
      // Students with no attendance stay at the bottom in both directions.
      if (left === null && right === null) {
        return a.student.studentName.localeCompare(b.student.studentName)
      }
      if (left === null) return 1
      if (right === null) return -1
      return sortBy === "highest" ? right - left : left - right
    })
    return sorted
  }, [filteredRows, sortBy])

  const stats = [
    {
      name: "Students",
      value: String(summary.totalStudents),
      change: `${summary.activeStudents} active`,
      changeType: "neutral" as const,
    },
    {
      name: "Average attendance",
      value: `${summary.averageAttendance}%`,
      change: `${summary.markedSessions} marked sessions`,
      changeType:
        summary.averageAttendance >= 75 ? ("positive" as const) : ("negative" as const),
    },
    {
      name: "Needs attention",
      value: String(summary.atRisk),
      change: `${summary.noAttendance} with no attendance`,
      changeType: summary.atRisk > 0 ? ("negative" as const) : ("positive" as const),
    },
    {
      name: "Outstanding fees",
      value: inr(summary.outstanding),
      change: `${summary.studentsWithDues} students with dues`,
      changeType:
        summary.outstanding > 0 ? ("negative" as const) : ("positive" as const),
    },
  ]

  return (
    <DashboardShell
      trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Report" }]}
    >
      <PageHeader
        title="Student Performance"
        description="Attendance and fee performance for every student. Attendance counts Present and Late as attended; fees compare recorded receipts with the student's resolved fee."
        meta={
          <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
            {students.length} students
          </span>
        }
        liveSlot={<LiveBadge />}
      />

      <Stats01 stats={stats} />

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm md:flex-row md:items-center">
        <div className="relative md:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search student, ID, group, or course"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          aria-label="Filter by group"
          className={cn(selectClassName, "md:w-44")}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="all">All groups</option>
          {groupOptions.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
          {students.some((student) => !(student.group ?? "").trim()) && (
            <option value="__ungrouped">Ungrouped</option>
          )}
        </select>
        <select
          aria-label="Filter by performance"
          className={cn(selectClassName, "md:w-48")}
          value={performanceFilter}
          onChange={(e) => setPerformanceFilter(e.target.value)}
        >
          <option value="all">All performance</option>
          <option value="Excellent">Excellent</option>
          <option value="Good">Good</option>
          <option value="Needs attention">Needs attention</option>
          <option value="No data">No data</option>
        </select>
        <select
          aria-label="Sort students"
          className={cn(selectClassName, "md:ml-auto md:w-48")}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="lowest">Lowest attendance</option>
          <option value="highest">Highest attendance</option>
          <option value="name">Student name</option>
        </select>
      </div>

      <div className="data-table-surface">
        <div className="data-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>P / A / L</TableHead>
                <TableHead>Fees</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Performance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hydrated ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-16 text-center text-sm text-muted-foreground"
                  >
                    Loading student performance…
                  </TableCell>
                </TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={students.length === 0 ? BarChart3Icon : SearchIcon}
                      title={
                        students.length === 0
                          ? "No students yet"
                          : "No matching students"
                      }
                      hint={
                        students.length === 0
                          ? "Add students and mark attendance to see performance here."
                          : "Try a different search, group, or performance filter."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => {
                  const student = row.student
                  return (
                    <TableRow key={student.studentId}>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">
                            {student.studentName}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{student.studentId}</span>
                            <span aria-hidden>·</span>
                            <span>{student.status || "Active"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {(student.group ?? "").trim() || "Ungrouped"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {student.course || "No course"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[140px]">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                rateClass(row.attendanceRate)
                              )}
                            >
                              {attendanceLabel(row.attendanceRate)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {row.sessions} session
                              {row.sessions === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-300",
                                barClass(row.attendanceRate)
                              )}
                              style={{ width: `${row.attendanceRate ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs tabular-nums">
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {row.present}P
                          </span>
                          <span className="text-rose-700 dark:text-rose-400">
                            {row.absent}A
                          </span>
                          <span className="text-amber-700 dark:text-amber-400">
                            {row.late}L
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={cn(
                              "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium ring-1 ring-inset",
                              feeStyles[row.feeStatus]
                            )}
                          >
                            {row.feeStatus}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {inr(row.paid)} / {inr(row.feeAmount)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-sm font-medium tabular-nums",
                            row.balance > 0
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {row.balance > 0 ? inr(row.balance) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
                            performanceStyles[row.performance]
                          )}
                        >
                          {row.performance}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Attendance percentage = (Present + Late) ÷ marked sessions; Excellent
        ≥ 90%, Good 75–89%, Needs attention below 75%. Students with no marked
        attendance show “No data”. Fee status uses paid receipts recorded
        against the student.
      </p>
    </DashboardShell>
  )
}
