"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRightIcon,
  Building2Icon,
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  LogOutIcon,
  ServerIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listProfiles, type ProfileSummary } from "@/lib/profiles"
import {
  clearActiveProfileId,
  getToken,
  setActiveProfileId,
} from "@/lib/session"

function formatDate(value: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// The gateway-admin panel is served privately under the fees API origin
// (https://api.myenum.in/youpi-admin/) and is gated per-request by the fees
// session JWT — not by any public URL. The console appends its own session
// token; the panel exchanges it once for the gateway admin token (verified
// against /api/auth/gate for super-admin sessions only), so no admin-token
// prompt ever appears. Super-admin (orgmenu) only: regular workspaces never
// get this panel.
function gatewayAdminUrl(token: string | null): string {
  if (typeof window === "undefined") return ""
  const query = token ? `?fees_token=${encodeURIComponent(token)}` : ""
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return `http://127.0.0.1:6001/${query}`
  }
  return token ? `https://api.myenum.in/youpi-admin/${query}` : ""
}

function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be blocked; the link is visible for manual copy.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => void copy()}
      title={copied ? "Copied" : "Copy payment link"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

export default function OrgMenuDashboardPage() {
  const router = useRouter()
  const { user, profile, activeProfile, isSuper, signOut } = useAuth()
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Session token (first-party cookie) — read after mount so SSR renders safely.
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  useEffect(() => {
    setSessionToken(getToken())
  }, [])
  const gatewayAdminSrc = gatewayAdminUrl(sessionToken)

  const viewingOther = activeProfile.profileId !== profile.profileId

  useEffect(() => {
    if (!isSuper) {
      router.replace("/dashboard")
      return
    }

    let active = true
    setLoading(true)
    listProfiles()
      .then((rows) => {
        if (active) {
          setProfiles(rows)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the organization list."
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [isSuper, router])

  function openWorkspace(profileId: string) {
    setActiveProfileId(profileId)
    router.push("/dashboard")
  }

  function exitView() {
    clearActiveProfileId()
    if (typeof window !== "undefined") window.location.reload()
  }

  const totalUsers = profiles.reduce((sum, item) => sum + item.userCount, 0)

  if (!isSuper) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Taking you back to your dashboard…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
            <Building2Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              Organization console
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Badge variant="secondary" className="ml-1 hidden sm:inline-flex">
            <ShieldCheckIcon className="size-3" />
            Super admin
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearActiveProfileId()
                router.push("/dashboard")
              }}
            >
              <LayoutDashboardIcon />
              My workspace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
            >
              <LogOutIcon />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Every workspace, one place
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Open any organization to inspect its students, fees, receipts, and
            settings. Regular accounts only ever see their own workspace.
          </p>
        </div>

        {viewingOther && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                You are viewing {activeProfile.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  ({activeProfile.profileId})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                That workspace&apos;s data is shown across the dashboard.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={exitView}>
              Exit view
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <Building2Icon className="size-3.5" />
              Workspaces
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {loading ? "—" : profiles.length}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <UsersIcon className="size-3.5" />
              User accounts
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {loading ? "—" : totalUsers}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <ExternalLinkIcon className="size-3.5" />
              Payment links
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {loading ? "—" : profiles.length}
            </p>
          </section>
        </div>

        {error && (
          <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">
                Organizations
              </h2>
              <p className="text-xs text-muted-foreground">
                Newest signups first · payment links follow the profile ID
              </p>
            </div>
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                Loading
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Profile ID</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead>Payment link</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && profiles.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium">No workspaces yet</p>
                      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                        Workspaces appear here as soon as someone signs up.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((item) => {
                    const isViewing =
                      activeProfile.profileId === item.profileId &&
                      viewingOther
                    return (
                      <TableRow key={item.profileId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground">
                              <Building2Icon className="size-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium">
                                {item.name}
                              </p>
                              {item.super && (
                                <Badge variant="secondary" className="mt-0.5">
                                  System
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                            {item.profileId}
                          </code>
                        </TableCell>
                        <TableCell>
                          <p className="text-[13px] font-medium">
                            {item.ownerName || "—"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.ownerEmail}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.userCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <a
                              href={item.paymentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex min-w-0 items-center gap-1 truncate text-[12px] font-medium underline underline-offset-4"
                            >
                              <span className="max-w-[220px] truncate">
                                {item.paymentUrl}
                              </span>
                              <ExternalLinkIcon className="size-3 shrink-0" />
                            </a>
                            <CopyLinkButton value={item.paymentUrl} />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formatDate(item.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Actions for ${item.name}`}
                                    title="Actions"
                                    className="size-8 text-muted-foreground hover:text-foreground"
                                  />
                                }
                              >
                                <EllipsisIcon className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom" className="w-48">
                                <DropdownMenuItem onClick={() => openWorkspace(item.profileId)}>
                                  <ArrowRightIcon className="size-4 text-primary" />
                                  <span>{isViewing ? "Viewing Workspace" : "Open Workspace"}</span>
                                </DropdownMenuItem>
                                {item.paymentUrl && (
                                  <>
                                    <DropdownMenuItem onClick={() => window.open(item.paymentUrl, "_blank")}>
                                      <ExternalLinkIcon className="size-4 text-muted-foreground" />
                                      <span>Visit Payment Link</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => void navigator.clipboard.writeText(item.paymentUrl)}
                                    >
                                      <CopyIcon className="size-4 text-muted-foreground" />
                                      <span>Copy Payment Link</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        {/* YOUPI PG Gateway Admin — private, session-gated super-admin console.
            Keep this block in orgmenu ONLY: it must never reappear in
            workspace settings. */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight">
                MyFees Gateway Admin
              </h2>
              <p className="text-xs text-muted-foreground">
                UPI accounts, slots, observers and payment queue — served privately
                under the dashboard (not publicly linked).
              </p>
            </div>
            {gatewayAdminSrc && (
              <a
                href={gatewayAdminSrc}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <ShieldAlertIcon className="size-3.5" />
                <span>Open Console</span>
                <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            The panel loads with your super-admin session and is not reachable
            from anywhere else. No extra sign-in is needed.
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {gatewayAdminSrc ? (
              <iframe
                src={gatewayAdminSrc}
                title="MyFees Gateway Admin"
                className="h-[720px] w-full border-0"
                loading="lazy"
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                Sign in as super admin to load the payment gateway console.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
