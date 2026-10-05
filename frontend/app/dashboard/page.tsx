"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  IndianRupeeIcon,
  MegaphoneIcon,
  PlusIcon,
  ReceiptIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard-shell"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { loadStudents } from "@/lib/students-store"
import { loadGroups } from "@/lib/groups-store"
import { loadReceipts } from "@/lib/receipts-store"
import { loadAnnouncements } from "@/lib/announcements-store"

function inr(n: number) {
  if (!Number.isFinite(n)) return "₹0"
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

export default function Page() {
  const [counts, setCounts] = useState({
    students: 0,
    groups: 0,
    receipts: 0,
    collected: 0,
    announcements: 0,
  })
  const [recentReceipts, setRecentReceipts] = useState<
    { id: string; name: string; amount: string; status: string }[]
  >([])
  const [recentStudents, setRecentStudents] = useState<
    { name: string; id: string; detail: string; status: string }[]
  >([])

  useEffect(() => {
    const students = loadStudents()
    const groups = loadGroups()
    const receipts = loadReceipts()
    const announcements = loadAnnouncements()
    const collected = receipts.reduce((sum, r) => {
      const v = parseFloat(String(r.amount))
      return sum + (Number.isFinite(v) ? v : 0)
    }, 0)
    setCounts({
      students: students.length,
      groups: groups.length,
      receipts: receipts.length,
      collected,
      announcements: announcements.length,
    })
    setRecentReceipts(
      [...receipts].slice(-5).reverse().map((r) => ({
        id: r.receiptId,
        name: `${r.studentName} (${r.studentId})`,
        amount: String(r.amount),
        status: r.status,
      }))
    )
    setRecentStudents(
      [...students].slice(-5).reverse().map((s) => ({
        name: s.studentName,
        id: s.studentId,
        detail: `${s.group ?? "—"} · ${s.course ?? "—"}`,
        status: s.status ?? "Active",
      }))
    )
  }, [])

  return (
    <DashboardShell
      crumbs={[{ label: "Dashboard" }]}
      title="Good morning — here's your fee overview"
      description="Track students, collections, and outreach at a glance. Every workflow below opens the same pages you already use."
      action={
        <>
          <Button variant="outline" render={<Link href="/dashboard/students" />}>
            <UsersIcon data-icon="inline-start" />
            Students
          </Button>
          <Button render={<Link href="/dashboard/receipts" />}>
            <PlusIcon data-icon="inline-start" />
            New receipt
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<GraduationCapIcon />}
          label="Students"
          value={String(counts.students)}
          hint={`${counts.groups} groups configured`}
        />
        <StatCard
          icon={<IndianRupeeIcon />}
          label="Collected"
          value={inr(counts.collected)}
          hint={`${counts.receipts} receipts recorded`}
        />
        <StatCard
          icon={<ReceiptIcon />}
          label="Receipts"
          value={String(counts.receipts)}
          hint="Auto-numbered RCP series"
        />
        <StatCard
          icon={<MegaphoneIcon />}
          label="Announcements"
          value={String(counts.announcements)}
          hint="WhatsApp broadcast log"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card-elevated overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Recent payments</h2>
              <p className="text-xs text-muted-foreground">Latest receipts across all students</p>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/receipts" />}>
              View all <ArrowRightIcon />
            </Button>
          </div>
          {recentReceipts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div className="flex size-11 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
                <WalletIcon className="size-5" />
              </div>
              <p className="text-sm font-medium">No payments yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Record your first payment — the receipt ID is generated automatically.
              </p>
              <Button size="sm" className="mt-1" render={<Link href="/dashboard/receipts" />}>
                <PlusIcon data-icon="inline-start" /> New receipt
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {recentReceipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{r.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">₹{r.amount}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-elevated overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Newest students</h2>
              <p className="text-xs text-muted-foreground">Recently enrolled</p>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/students" />}>
              View all <ArrowRightIcon />
            </Button>
          </div>
          {recentStudents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div className="flex size-11 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
                <GraduationCapIcon className="size-5" />
              </div>
              <p className="text-sm font-medium">No students yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Add students to unlock groups, fee structures, and receipts.
              </p>
              <Button size="sm" className="mt-1" render={<Link href="/dashboard/students" />}>
                <PlusIcon data-icon="inline-start" /> Add student
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {recentStudents.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: <ClipboardListIcon />, title: "Fee structures", desc: "Define heads, assign students", href: "/dashboard/fee-structure" },
          { icon: <UsersIcon />, title: "Student groups", desc: "Batches, courses & schedules", href: "/dashboard/students/groups" },
          { icon: <MegaphoneIcon />, title: "Announcements", desc: "Broadcast via WhatsApp", href: "/dashboard/announcements" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card-elevated card-elevated-hover group flex items-center gap-4 p-5"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-b from-muted to-muted/40 shadow-xs [&_svg]:size-[18px]">
              {c.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">{c.title}</p>
              <p className="truncate text-xs text-muted-foreground">{c.desc}</p>
            </div>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </DashboardShell>
  )
}
