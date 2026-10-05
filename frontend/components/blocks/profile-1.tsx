"use client"

import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Mail,
  ShieldCheck,
  Sprout,
  Receipt,
  Megaphone,
  Hash,
  Plug,
  Database,
  RefreshCw,
  Building2,
} from "lucide-react"

export interface ProfileUser {
  name: string
  email: string
  role: string
  workspace: string
  userId: string
}

export interface ProfileStat {
  label: string
  value: string
}

export interface ProfileReceipt {
  id: string
  student: string
  amount: string
  date: string
}

export interface ProfileAnnouncement {
  id: string
  title: string
  meta: string
}

export interface ProfileSystem {
  apiUrl: string
  database: string
  sync: string
  whatsapp: string
}

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1 && parts[0][0] && parts[parts.length - 1][0])
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (name.trim()) return name.trim().slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="block truncate font-medium">{value}</span>
      </span>
    </li>
  )
}

export default function ProfileBlock({
  user,
  stats,
  receipts,
  announcements,
  system,
  optionCount,
  onSignOut,
}: {
  user: ProfileUser
  stats: ProfileStat[]
  receipts: ProfileReceipt[]
  announcements: ProfileAnnouncement[]
  system: ProfileSystem
  optionCount: number
  onSignOut: () => void
}) {
  return (
    <section className="w-full shrink-0">
      <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div
          className="h-36 w-full bg-linear-to-br from-foreground/15 via-muted to-muted-foreground/10 sm:h-44"
          aria-hidden="true"
        />

        <div className="px-6 pb-6 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <Avatar className="-mt-10 size-20 border-4 border-card sm:size-24">
                <AvatarFallback className="text-lg font-semibold">
                  {initials(user.name, user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {user.name}
                  </h1>
                  <Badge variant="secondary">{user.role}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Button variant="outline" size="sm" render={<Link href="/dashboard/settings" />}>
                Settings
              </Button>
              <Button size="sm" onClick={onSignOut}>
                Sign out
              </Button>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm/relaxed text-foreground/80">
            {user.workspace} · Fees Manager — enrolments, groups, fee
            structures, receipts, and announcements, stored in Postgres and
            synced live across every page.
          </p>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {stats.map((stat) => (
              <span key={stat.label} className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tabular-nums">{stat.value}</span>
                <span className="text-muted-foreground">{stat.label}</span>
              </span>
            ))}
          </div>

          <Tabs defaultValue="activity" className="mt-6 gap-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="activity" className="flex-1 sm:flex-none sm:px-6">
                Activity
              </TabsTrigger>
              <TabsTrigger value="about" className="flex-1 sm:flex-none sm:px-6">
                About
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity">
              {receipts.length === 0 && announcements.length === 0 ? (
                <p className="rounded-lg border border-border p-6 text-center text-xs text-muted-foreground">
                  No activity yet — records you create will appear here.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <h2 className="text-[13px] font-semibold tracking-tight">
                      Recent receipts
                    </h2>
                    {receipts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No receipts yet.</p>
                    ) : (
                      receipts.map((r) => (
                        <article
                          key={r.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-4"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border bg-muted/60 text-muted-foreground">
                            <Receipt className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold">
                              ₹ {r.amount} · {r.student}
                            </h3>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {r.id} · {r.date}
                            </p>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <h2 className="text-[13px] font-semibold tracking-tight">
                      Latest announcements
                    </h2>
                    {announcements.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
                    ) : (
                      announcements.map((a) => (
                        <article
                          key={a.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-4"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border bg-muted/60 text-muted-foreground">
                            <Megaphone className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold">
                              {a.title}
                            </h3>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {a.meta}
                            </p>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="about">
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <h2 className="text-[13px] font-semibold tracking-tight">Account</h2>
                  <ul className="mt-3 flex flex-col gap-3">
                    <Fact icon={Mail} label="Email" value={user.email} />
                    <Fact icon={Hash} label="User ID" value={`#${user.userId}`} />
                    <Fact icon={ShieldCheck} label="Role" value={user.role} />
                  </ul>
                </div>
                <div>
                  <h2 className="text-[13px] font-semibold tracking-tight">Workspace</h2>
                  <ul className="mt-3 flex flex-col gap-3">
                    <Fact icon={Sprout} label="Organization" value={user.workspace} />
                    <Fact icon={Building2} label="Product" value="Fees Manager" />
                    <Fact icon={Database} label="Database" value={system.database} />
                  </ul>
                </div>
                <div>
                  <h2 className="text-[13px] font-semibold tracking-tight">Connection</h2>
                  <ul className="mt-3 flex flex-col gap-3">
                    <Fact icon={Plug} label="API" value={system.apiUrl} />
                    <Fact icon={RefreshCw} label="Sync" value={system.sync} />
                    <Fact icon={Megaphone} label="WhatsApp" value={system.whatsapp} />
                  </ul>
                </div>
              </div>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground">
                {optionCount} dropdown options configured across 8 lists · Forms
                pick up changes live ·{" "}
                <Link href="/dashboard/settings" className="font-medium text-foreground underline underline-offset-4">
                  Manage in Settings
                </Link>
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  )
}
