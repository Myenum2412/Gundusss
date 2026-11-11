"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Building2Icon,
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  StoreIcon,
  TerminalIcon,
  Trash2Icon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { DashboardShell } from "@/components/dashboard-shell"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { listProfiles, type ProfileSummary } from "@/lib/profiles"
import { clearActiveProfileId, getToken } from "@/lib/session"
import { cn } from "cn"

type GatewaySection = "operations" | "control-center"

// The gateway console (Operations Hub & Control Center / Logs) is served privately under the fees API origin
// (https://api.myenum.in/youpi-admin/) and is gated per-request by the fees
// session JWT — not by any public URL. The console appends its own session
// token; the panel exchanges it once for the gateway admin token (verified
// against /api/auth/gate for super-admin sessions only), so no admin-token
// prompt ever appears. Super-admin (orgmenu) only: regular workspaces never
// get this panel, and standalone URL access outside orgmenu is disallowed.
function gatewayConsoleUrl(token: string | null, section: GatewaySection = "operations"): string {
  if (typeof window === "undefined") return ""
  const resolvedToken = token || getToken()
  const params = new URLSearchParams()
  if (resolvedToken) params.set("fees_token", resolvedToken)
  params.set("section", section === "control-center" ? "control-center" : "operations")
  const hash = section === "control-center" ? "#supervisor" : "#operations"
  const query = `?${params.toString()}${hash}`
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return `http://127.0.0.1:6001/${query}`
  }
  return resolvedToken ? `https://api.myenum.in/youpi-admin/${query}` : ""
}

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

export default function OrgMenuDashboardPage() {
  const router = useRouter()
  const { user, profile, activeProfile, isSuper } = useAuth()
  const [profiles, setProfiles] = useState<ProfileSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [gatewaySection, setGatewaySection] = useState<GatewaySection>("operations")
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState<ProfileSummary | null>(null)
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setSessionToken(getToken())
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase()
      if (hash === "control-center" || hash === "logs" || hash === "supervisor") {
        setGatewaySection("control-center")
      } else if (hash === "operations" || hash === "merchant-admin" || hash === "cashier") {
        setGatewaySection("operations")
      }
    }
    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
  }, [])

  const gatewayConsoleSrc = gatewayConsoleUrl(sessionToken, gatewaySection)

  const viewingOther = activeProfile.profileId !== profile.profileId

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listProfiles()
      setProfiles(rows)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the organization list."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSuper) {
      router.replace("/dashboard")
      return
    }
    void load()
  }, [isSuper, router, load])

  const filteredProfiles = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return profiles
    return profiles.filter((item) =>
      [item.name, item.profileId, item.ownerName, item.ownerEmail]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [profiles, query])

  const totalUsers = useMemo(
    () => profiles.reduce((sum, item) => sum + item.userCount, 0),
    [profiles]
  )
  const paymentLinks = useMemo(
    () => profiles.filter((item) => Boolean(item.paymentUrl)).length,
    [profiles]
  )
  const allFilteredSelected =
    filteredProfiles.length > 0 &&
    filteredProfiles.every((item) => selectedIds.has(item.profileId))

  function exitView() {
    clearActiveProfileId()
    if (typeof window !== "undefined") window.location.reload()
  }

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1600)
    } catch {
      // Clipboard access can be blocked; the link stays visible for manual copy.
    }
  }

  async function copySelectedLinks() {
    const links = profiles
      .filter((item) => selectedIds.has(item.profileId))
      .map((item) => item.paymentUrl)
      .filter(Boolean)
    if (links.length === 0) return
    await copyText(links.join("\n"), "__selected__")
  }

  async function handleDeleteProfile(profileId: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Failed to delete workspace")
      }
      setConfirmDeleteProfile(null)
      await load()
    } catch (err: any) {
      alert(err.message || "Failed to delete workspace")
    } finally {
      setDeleting(false)
    }
  }

  async function handlePurgeAll() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/profiles/purge-all-except-super`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Failed to purge users and data")
      }
      setConfirmPurgeAll(false)
      await load()
    } catch (err: any) {
      alert(err.message || "Failed to purge data")
    } finally {
      setDeleting(false)
    }
  }

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

  const stats = [
    {
      label: "Workspaces",
      value: loading ? "—" : profiles.length,
      hint: "Registered organizations",
      icon: <Building2Icon className="size-3.5" />,
    },
    {
      label: "User accounts",
      value: loading ? "—" : totalUsers,
      hint: "Across every workspace",
      icon: <UsersIcon className="size-3.5" />,
    },
    {
      label: "Payment links",
      value: loading ? "—" : paymentLinks,
      hint: "Public UPI pages",
      icon: <WalletIcon className="size-3.5" />,
    },
    {
      label: "Console access",
      value: "Super admin",
      hint: user.email,
      icon: <ShieldCheckIcon className="size-3.5" />,
    },
  ]

  return (
    <DashboardShell
      trail={[{ label: "Organization console" }]}
    >
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-primary/5 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheckIcon className="size-3" />
                Super admin
              </Badge>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Organization console
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
              Every workspace, one control room
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Review every organization, its owner, and its public payment link.
              This console is isolated from workspace dashboards and the
              workspace sidebar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border bg-background/80 px-3.5 py-2 backdrop-blur">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Signed in as
              </p>
              <p className="max-w-[230px] truncate text-[12px] font-semibold">
                {user.email}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </section>

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

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <section
            key={stat.label}
            className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary">
                {stat.icon}
              </span>
              {stat.label}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{stat.value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{stat.hint}</p>
          </section>
        ))}
      </div>

      {error && (
        <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}

      {/* Workspace table */}
      <section
        id="workspaces"
        className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">
              Organizations
            </h2>
            <p className="text-xs text-muted-foreground">
              Newest signups first · payment links follow the profile ID
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search workspaces…"
                className="h-8 w-full pl-8 text-xs sm:w-64"
                aria-label="Search workspaces"
              />
            </div>
            {selectedIds.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => void copySelectedLinks()}
              >
                {copiedKey === "__selected__" ? <CheckIcon /> : <CopyIcon />}
                Copy links ({selectedIds.size})
              </Button>
            )}
            {profiles.some((p) => !p.super) && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmPurgeAll(true)}
                disabled={deleting}
              >
                <Trash2Icon className="size-3.5" />
                Purge All Non-Super Data
              </Button>
            )}
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                Loading
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const next = new Set(selectedIds)
                        filteredProfiles.forEach((item) =>
                          next.add(item.profileId)
                        )
                        setSelectedIds(next)
                      } else {
                        const next = new Set(selectedIds)
                        filteredProfiles.forEach((item) =>
                          next.delete(item.profileId)
                        )
                        setSelectedIds(next)
                      }
                    }}
                    aria-label="Select all workspaces"
                  />
                </TableHead>
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
              {!loading && filteredProfiles.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="px-6 py-12 text-center">
                    <p className="text-sm font-medium">
                      {profiles.length === 0
                        ? "No workspaces yet"
                        : "No workspaces match your search"}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                      {profiles.length === 0
                        ? "Workspaces appear here as soon as someone signs up."
                        : "Try a different name, profile ID, or owner email."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProfiles.map((item) => {
                  return (
                    <TableRow
                      key={item.profileId}
                      data-state={
                        selectedIds.has(item.profileId) ? "selected" : undefined
                      }
                    >
                      <TableCell className="w-10 px-3">
                        <Checkbox
                          checked={selectedIds.has(item.profileId)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds)
                            if (checked) next.add(item.profileId)
                            else next.delete(item.profileId)
                            setSelectedIds(next)
                          }}
                          aria-label={`Select ${item.name}`}
                        />
                      </TableCell>
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              void copyText(
                                item.paymentUrl,
                                `link:${item.profileId}`
                              )
                            }
                            title={
                              copiedKey === `link:${item.profileId}`
                                ? "Copied"
                                : "Copy payment link"
                            }
                          >
                            {copiedKey === `link:${item.profileId}` ? (
                              <CheckIcon />
                            ) : (
                              <CopyIcon />
                            )}
                          </Button>
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
                              <DropdownMenuItem
                                onClick={() =>
                                  void copyText(
                                    item.profileId,
                                    `id:${item.profileId}`
                                  )
                                }
                              >
                                <CopyIcon className="size-4 text-muted-foreground" />
                                <span>Copy Workspace ID</span>
                              </DropdownMenuItem>
                              {item.paymentUrl && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      window.open(item.paymentUrl, "_blank")
                                    }
                                  >
                                    <ExternalLinkIcon className="size-4 text-muted-foreground" />
                                    <span>Visit Payment Link</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void copyText(
                                        item.paymentUrl,
                                        `menu:${item.profileId}`
                                      )
                                    }
                                  >
                                    <CopyIcon className="size-4 text-muted-foreground" />
                                    <span>Copy Payment Link</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!item.super && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setConfirmDeleteProfile(item)}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <Trash2Icon className="size-4 text-destructive" />
                                    <span>Delete Workspace & Data</span>
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

        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground",
            !profiles.length && "hidden"
          )}
        >
          <span>
            {filteredProfiles.length} of {profiles.length} workspace
            {profiles.length === 1 ? "" : "s"}
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </span>
          <span className="hidden sm:block">Multi-tenant institution hierarchy</span>
        </div>
      </section>

      {/* Payment Gateway Console (Operations & Control Center) — private, session-gated super-admin console.
          Only shown in orgmenu; direct access to the standalone URL outside orgmenu is disallowed. */}
      <section
        id="operations"
        className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-slate-700 text-white">
                {gatewaySection === "control-center" ? (
                  <TerminalIcon className="size-3.5" />
                ) : (
                  <StoreIcon className="size-3.5" />
                )}
              </span>
              <h2 className="text-[13px] font-semibold tracking-tight">
                {gatewaySection === "control-center"
                  ? "Payment Gateway Control Center"
                  : "Payment Gateway Operations Hub"}
              </h2>
              <Badge variant="outline" className="text-[10px] font-medium">
                {gatewaySection === "control-center"
                  ? "Host Processes & Logs"
                  : "VPAs, Cashier & Ledger"}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
                <ShieldCheckIcon className="size-3 text-emerald-600" />
                Orgmenu only
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              {gatewaySection === "control-center"
                ? "Real-time process supervisor (ports 6100, 7000, 6001, etc.), service health, and aggregate live terminal logs."
                : "Receiving accounts (VPAs), slots, live payment observers, POS cashier till desk, and payment ledger."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-muted/50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setGatewaySection("operations")
                  window.location.hash = "#operations"
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                  gatewaySection === "operations"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <StoreIcon className="size-3.5" />
                <span>Daily Operations</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGatewaySection("control-center")
                  window.location.hash = "#control-center"
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                  gatewaySection === "control-center"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <TerminalIcon className="size-3.5" />
                <span>Control Center (Logs)</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {gatewaySection === "control-center"
              ? "The Control Center streams live logs via Server-Sent Events (SSE) and supervises local gateway daemons. Authenticated automatically via your super-admin session."
              : "The Operations Hub provides complete operational control over receiving accounts, slots, cashier counter desk, and payment verification."}
          </span>
          <span className="hidden font-mono text-[10px] opacity-75 sm:inline">
            Embedded Console · Standalone Access Disabled
          </span>
        </div>

        {gatewayConsoleSrc ? (
          <iframe
            key={gatewaySection}
            src={gatewayConsoleSrc}
            title={
              gatewaySection === "control-center"
                ? "Payment Gateway Control Center (Logs)"
                : "Payment Gateway Merchant Operations"
            }
            className="h-[780px] w-full border-0"
            loading="lazy"
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Sign in as super admin to load the payment gateway console.
          </p>
        )}
      </section>

      <DeleteConfirmDialog
        open={confirmDeleteProfile !== null}
        onOpenChange={(v) => {
          if (!v) setConfirmDeleteProfile(null)
        }}
        title={`Delete "${confirmDeleteProfile?.name}" workspace?`}
        description={`This will permanently delete the workspace (${confirmDeleteProfile?.profileId}), all its enrolled users, and all its student, fee, receipt, and payment records. This action cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete Workspace & Data"}
        onConfirm={() => {
          if (confirmDeleteProfile) void handleDeleteProfile(confirmDeleteProfile.profileId)
        }}
      />

      <DeleteConfirmDialog
        open={confirmPurgeAll}
        onOpenChange={setConfirmPurgeAll}
        title="Purge ALL users and data (except developer)?"
        description="This will permanently delete all organizations, workspaces, enrolled users, students, fee structures, receipts, and payment data EXCEPT the developer@myenum.in super administrator account and the orgmenu workspace. This action cannot be undone."
        confirmLabel={deleting ? "Purging…" : "Purge Everything"}
        onConfirm={() => void handlePurgeAll()}
      />
    </DashboardShell>
  )
}
