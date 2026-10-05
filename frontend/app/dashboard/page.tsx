"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadReceipts, type StoredReceipt } from "@/lib/receipts-store"
import { loadAnnouncements, type StoredAnnouncement } from "@/lib/announcements-store"
import { getWaStatus, type WaState } from "@/lib/api"
import { momTrend } from "@/lib/stat-trend"
import Stats01 from "@/components/stats-01"
import { RowActions } from "@/components/row-actions"
import { DetailItem, DetailList } from "@/components/detail-list"
import { LiveBadge } from "@/components/live-badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { isSyncing, sameJson } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ClipboardListIcon,
  LayersIcon,
  MegaphoneIcon,
  PlusIcon,
  ReceiptIcon,
  SettingsIcon,
} from "lucide-react"

function inr(n: number) {
  return `₹ ${n.toLocaleString("en-IN")}`
}

export default function Page() {
  const [students, setStudents] = useState<StoredStudent[]>([])
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [announcements, setAnnouncements] = useState<StoredAnnouncement[]>([])
  const [wa, setWa] = useState<WaState | null>(null)
  const [viewReceipt, setViewReceipt] = useState<StoredReceipt | null>(null)

  const reloadOverview = useCallback(() => {
    if (isSyncing()) return
    Promise.all([loadStudents(), loadReceipts(), loadAnnouncements()]).then(
      ([s, r, a]) => {
        if (isSyncing()) return
        setStudents((prev) => (sameJson(prev, s) ? prev : s))
        setReceipts((prev) => (sameJson(prev, r) ? prev : r))
        setAnnouncements((prev) => (sameJson(prev, a) ? prev : a))
      }
    )
  }, [])

  useEffect(() => {
    reloadOverview()
    getWaStatus().then(setWa).catch(() => setWa(null))
  }, [reloadOverview])

  useLiveReload(reloadOverview)

  const collected = receipts.reduce((sum, r) => sum + (parseFloat(String(r.amount)) || 0), 0)
  const waOk = wa?.status === "ready"

  const stats = [
    {
      name: "Total students",
      value: String(students.length),
      ...momTrend(students.map((s) => ({ date: s.joiningDate }))),
    },
    {
      name: "Fees collected",
      value: inr(collected),
      ...momTrend(receipts.map((r) => ({ date: r.paymentDate, amount: parseFloat(String(r.amount)) || 0 }))),
    },
    {
      name: "Receipts issued",
      value: String(receipts.length),
      ...momTrend(receipts.map((r) => ({ date: r.paymentDate }))),
    },
    {
      name: "Announcements",
      value: String(announcements.length),
      ...momTrend(announcements.map((a) => ({ date: a.createdAt }))),
    },
  ]

  // Collections by month (last 6 months, from receipts page data)
  const byMonth = (() => {
    const map = new Map<string, number>()
    for (const r of receipts) {
      const key = (r.paymentDate || "").slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(key)) continue
      map.set(key, (map.get(key) ?? 0) + (parseFloat(String(r.amount)) || 0))
    }
    return [...map.entries()].sort().slice(-6)
  })()
  const maxMonth = Math.max(1, ...byMonth.map(([, v]) => v))

  // Collections by payment method (from receipts page data)
  const byMethod = (() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const r of receipts) {
      const m = r.method || "Other"
      const e = map.get(m) ?? { count: 0, total: 0 }
      e.count += 1
      e.total += parseFloat(String(r.amount)) || 0
      map.set(m, e)
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5)
  })()
  const maxMethod = Math.max(1, ...byMethod.map(([, v]) => v.total))

  const recentReceipts = receipts.slice(-6).reverse()
  const recentStudents = students.slice(-5).reverse()
  const recentAnnouncements = announcements.slice(-4).reverse()

  const shortcuts = [
    { title: "Fee Structure", desc: "Define fee heads and assign students", icon: ClipboardListIcon, href: "/dashboard/fee-structure" },
    { title: "Student Groups", desc: "Bundle students by course and batch", icon: LayersIcon, href: "/dashboard/students/groups" },
    { title: "Announcements", desc: "Message students on WhatsApp", icon: MegaphoneIcon, href: "/dashboard/announcements" },
    { title: "Settings", desc: wa ? (waOk ? `WhatsApp connected (+${wa.connectedNumber ?? "?"})` : "WhatsApp not connected") : "WhatsApp and dropdown options", icon: SettingsIcon, href: "/dashboard/settings", badge: wa ? (waOk ? "Connected" : "Not connected") : undefined },
  ]

  return (
    <DashboardShell trail={[{ label: "Dashboard" }]}>
      <PageHeader
        title="Overview"
        description="Students, groups, fee structures, receipts, announcements, and WhatsApp — at a glance."
        meta={<LiveBadge />}
        actions={
          <>
            <Button variant="outline" render={<Link href="/dashboard/receipts" />}>
              <ReceiptIcon />
              New Receipt
            </Button>
            <Button render={<Link href="/dashboard/students" />}>
              <PlusIcon />
              Add Student
            </Button>
          </>
        }
      />

      {/* Stat strip — stats-01 block, one stat per area */}
      <Stats01 stats={stats} />

      {/* Collections + methods */}
      <div className="grid shrink-0 gap-3 lg:grid-cols-5">
        <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">Collections by month</h2>
              <p className="text-xs text-muted-foreground">Summed from the Receipts page</p>
            </div>
            <Button variant="outline" size="sm" render={<Link href="/dashboard/receipts" />}>
              Receipts
              <ArrowRightIcon />
            </Button>
          </div>
          {byMonth.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No dated receipts yet — record a payment to see monthly totals here.
            </p>
          ) : (
            <div className="mt-4 flex h-36 items-end gap-2">
              {byMonth.map(([month, total]) => (
                <div key={month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${month}: ${inr(total)}`}>
                  <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                    {total >= 1000 ? `${Math.round(total / 1000)}k` : total}
                  </span>
                  <div className="flex w-full flex-1 items-end rounded-lg bg-muted/60">
                    <div
                      className="w-full rounded-lg bg-primary"
                      style={{ height: `${Math.max(6, (total / maxMonth) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">By payment method</h2>
              <p className="text-xs text-muted-foreground">Top methods from Receipts</p>
            </div>
          </div>
          {byMethod.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No receipts yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {byMethod.map(([method, v]) => (
                <li key={method}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium">{method}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {v.count} · {inr(v.total)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (v.total / maxMethod) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent receipts — full width table */}
      <div className="data-table-surface">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight">Recent receipts</h2>
            <p className="text-xs text-muted-foreground">Latest payments across all students</p>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/dashboard/receipts" />}>
            View all
            <ArrowRightIcon />
          </Button>
        </div>
        <div className="data-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt ID</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentReceipts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="px-6 py-12 text-center">
                    <p className="text-sm font-medium">No receipts yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                      Add students, then record a payment from the Receipts page. It will show up here.
                    </p>
                    <Button size="sm" className="mt-4" render={<Link href="/dashboard/receipts" />}>
                      Go to Receipts
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                recentReceipts.map((r) => (
                  <TableRow key={r.receiptId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.receiptId}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      {r.studentName} <span className="font-mono text-xs font-normal text-muted-foreground">({r.studentId})</span>
                    </TableCell>
                    <TableCell className="tabular-nums">₹ {r.amount}</TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell className="tabular-nums">{r.paymentDate}</TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewReceipt(r)}
                        viewLabel="View receipt"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={viewReceipt !== null}
        onOpenChange={(v) => {
          if (!v) setViewReceipt(null)
        }}
      >
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              Receipt details
            </DialogTitle>
            <DialogDescription>
              {viewReceipt?.receiptId} · {viewReceipt?.studentName}
            </DialogDescription>
          </DialogHeader>
          {viewReceipt && (
            <div className="px-6 py-5">
              <DetailList>
                <DetailItem label="Receipt ID">{viewReceipt.receiptId}</DetailItem>
                <DetailItem label="Student">
                  {viewReceipt.studentName} ({viewReceipt.studentId})
                </DetailItem>
                <DetailItem label="Amount">₹ {viewReceipt.amount}</DetailItem>
                <DetailItem label="Payment Method">{viewReceipt.method || "—"}</DetailItem>
                <DetailItem label="Payment Date">{viewReceipt.paymentDate || "—"}</DetailItem>
                <DetailItem label="Status">
                  <StatusBadge value={viewReceipt.status} />
                </DetailItem>
                <DetailItem label="Notes">{viewReceipt.notes || "—"}</DetailItem>
              </DetailList>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/dashboard/receipts" />}
                >
                  Manage receipts
                  <ArrowRightIcon />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* People + messages + shortcuts */}
      <div className="grid shrink-0 gap-3 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold tracking-tight">Newest students</h2>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" render={<Link href="/dashboard/students" />}>
              View all
              <ArrowRightIcon />
            </Button>
          </div>
          {recentStudents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No students yet.{" "}
              <Link href="/dashboard/students" className="font-medium text-foreground underline underline-offset-4">
                Add one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70">
              {recentStudents.map((s) => (
                <li key={s.studentId} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted/60 text-xs font-semibold text-muted-foreground">
                    {s.studentName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{s.studentName}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{s.studentId} · {s.course || s.group || "—"}</p>
                  </div>
                  <StatusBadge value={s.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold tracking-tight">Latest announcements</h2>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" render={<Link href="/dashboard/announcements" />}>
              View all
              <ArrowRightIcon />
            </Button>
          </div>
          {recentAnnouncements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing sent yet.{" "}
              <Link href="/dashboard/announcements" className="font-medium text-foreground underline underline-offset-4">
                Compose one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70">
              {recentAnnouncements.map((a) => (
                <li key={a.announcementId} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{a.title}</p>
                    <StatusBadge value={a.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {a.sentCount}/{a.recipientIds.length} delivered · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <h2 className="text-[13px] font-semibold tracking-tight">Manage everything</h2>
          <p className="text-xs text-muted-foreground">Jump to any section</p>
          <ul className="mt-3 flex flex-col gap-1">
            {shortcuts.map((c) => (
              <li key={c.title}>
                <Link
                  href={c.href}
                  className="app-transition group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/70"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border bg-muted/60 text-muted-foreground">
                    <c.icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px] font-medium">
                      {c.title}
                      {c.badge && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${c.badge === "Connected" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-muted text-muted-foreground ring-border"}`}>
                          {c.badge}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{c.desc}</span>
                  </span>
                  <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardShell>
  )
}
