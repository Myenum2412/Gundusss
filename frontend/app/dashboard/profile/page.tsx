"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { LiveBadge } from "@/components/live-badge"
import ProfileBlock from "@/components/blocks/profile-1"
import { loadStudents } from "@/lib/students-store"
import { loadGroups } from "@/lib/groups-store"
import { loadFeeStructures } from "@/lib/fee-structures-store"
import { loadReceipts } from "@/lib/receipts-store"
import { loadAnnouncements } from "@/lib/announcements-store"
import { loadDropdowns, DROPDOWN_KEYS } from "@/lib/dropdown-store"
import { getWaStatus } from "@/lib/api"
import { isSyncing } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import type { AuthUser } from "@/lib/api"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

export default function ProfilePage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [counts, setCounts] = useState({
    students: 0,
    groups: 0,
    structures: 0,
    receipts: 0,
    announcements: 0,
    collected: 0,
    options: 0,
  })
  const [recentReceipts, setRecentReceipts] = useState<
    { id: string; student: string; amount: string; date: string }[]
  >([])
  const [recentAnnouncements, setRecentAnnouncements] = useState<
    { id: string; title: string; meta: string }[]
  >([])
  const [whatsapp, setWhatsapp] = useState("Checking…")

  const reloadProfile = useCallback(() => {
    if (isSyncing()) return
    Promise.all([
      loadStudents(),
      loadGroups(),
      loadFeeStructures(),
      loadReceipts(),
      loadAnnouncements(),
      loadDropdowns(),
    ]).then(([students, groups, structures, receipts, announcements, dropdowns]) => {
      if (isSyncing()) return
      const collected = receipts.reduce(
        (sum, r) => sum + (parseFloat(String(r.amount)) || 0),
        0
      )
      setCounts({
        students: students.length,
        groups: groups.length,
        structures: structures.length,
        receipts: receipts.length,
        announcements: announcements.length,
        collected,
        options: DROPDOWN_KEYS.reduce(
          (sum, k) => sum + (dropdowns[k]?.length ?? 0),
          0
        ),
      })
      setRecentReceipts(
        receipts.slice(-6).reverse().map((r) => ({
          id: r.receiptId,
          student: `${r.studentName} (${r.studentId})`,
          amount: r.amount,
          date: r.paymentDate || "—",
        }))
      )
      setRecentAnnouncements(
        announcements.slice(-4).reverse().map((a) => ({
          id: a.announcementId,
          title: a.title,
          meta: `${a.announcementId} · ${a.sentCount}/${a.recipientIds.length} delivered`,
        }))
      )
    })
    getWaStatus()
      .then((s) =>
        setWhatsapp(
          s.status === "ready"
            ? `Connected${s.connectedNumber ? ` (+${s.connectedNumber})` : ""}`
            : s.status === "qr"
              ? "Scan QR to connect"
              : s.status === "starting"
                ? "Starting…"
                : "Not connected"
        )
      )
      .catch(() => setWhatsapp("Backend offline"))
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("auth_user")
      if (raw) setAuthUser(JSON.parse(raw) as AuthUser)
    } catch {}
    reloadProfile()
  }, [reloadProfile])

  useLiveReload(reloadProfile)

  function onSignOut() {
    try {
      localStorage.removeItem("auth_user")
    } catch {}
    router.push("/login")
  }

  const email = authUser?.email ?? "admin@seedsofsuccess.in"

  return (
    <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Profile" }]}>
      <PageHeader
        title="Profile"
        description="Your account, workspace stats, system connection, and recent activity."
        meta={<LiveBadge />}
      />
      <ProfileBlock
        user={{
          name: "Admin",
          email,
          role: "Admin",
          workspace: "Seeds of Success",
          userId: String(authUser?.id ?? 1),
        }}
        stats={[
          { label: "Students", value: String(counts.students) },
          { label: "Groups", value: String(counts.groups) },
          { label: "Fee structures", value: String(counts.structures) },
          { label: "Receipts", value: String(counts.receipts) },
          {
            label: "Collected",
            value: `₹ ${counts.collected.toLocaleString("en-IN")}`,
          },
          { label: "Announcements", value: String(counts.announcements) },
        ]}
        receipts={recentReceipts}
        announcements={recentAnnouncements}
        system={{
          apiUrl: API_URL,
          database: "Postgres · fees",
          sync: "Live · every 5s",
          whatsapp,
        }}
        optionCount={counts.options}
        onSignOut={onSignOut}
      />
    </DashboardShell>
  )
}
