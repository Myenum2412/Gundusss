"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CheckCircle2Icon,
  Loader2Icon,
  MessageCircleIcon,
  QrCodeIcon,
  RefreshCwIcon,
  SendIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DashboardShell } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import {
  getWaStatus,
  logoutWa,
  sendWaMessage,
  startWa,
  type WaState,
} from "@/lib/api"
import {
  DROPDOWN_KEYS,
  DROPDOWN_LABELS,
  loadDropdowns,
  saveDropdowns,
  type DropdownKey,
  type DropdownMap,
} from "@/lib/dropdown-store"

const badge: Record<WaState["status"], string> = {
  idle: "bg-muted text-muted-foreground",
  starting: "bg-yellow-100 text-yellow-800",
  qr: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  disconnected: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-800",
}

const label: Record<WaState["status"], string> = {
  idle: "Not started",
  starting: "Starting…",
  qr: "Scan QR to connect",
  ready: "Connected",
  disconnected: "Disconnected",
  error: "Error",
}

export default function SettingsPage() {
  const [wa, setWa] = useState<WaState | null>(null)
  const [waError, setWaError] = useState("")
  const [to, setTo] = useState("")
  const [message, setMessage] = useState("")
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">(
    "idle"
  )
  const [sendError, setSendError] = useState("")
  const [sendId, setSendId] = useState<string | null>(null)
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [newValues, setNewValues] = useState<Record<DropdownKey, string>>({
    gender: "",
    classGroup: "",
    course: "",
    studentStatus: "",
    feeFrequency: "",
    feeType: "",
    paymentMethod: "",
    receiptStatus: "",
  })

  const refresh = useCallback(async () => {
    try {
      setWaError("")
      setWa(await getWaStatus())
    } catch (err: any) {
      setWaError(err?.message ?? "Backend unreachable")
    }
  }, [])

  useEffect(() => {
    refresh()
    // Poll until connected; the QR refreshes server-side on expiry.
    const t = setInterval(async () => {
      try {
        const s = await getWaStatus()
        setWa(s)
        if (s.status === "ready") clearInterval(t)
      } catch {
        // keep polling; backend may still be booting
      }
    }, 4000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    setDropdowns(loadDropdowns())
  }, [])

  function addOption(key: DropdownKey) {
    const value = newValues[key].trim()
    if (!value) return
    setDropdowns((prev) => {
      if (!prev || prev[key].includes(value)) return prev
      const next = { ...prev, [key]: [...prev[key], value] }
      saveDropdowns(next)
      return next
    })
    setNewValues((prev) => ({ ...prev, [key]: "" }))
  }

  function removeOption(key: DropdownKey, value: string) {
    setDropdowns((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: prev[key].filter((o) => o !== value) }
      saveDropdowns(next)
      return next
    })
  }

  async function onStart() {
    try {
      setWaError("")
      setWa(await startWa())
    } catch (err: any) {
      setWaError(err?.message ?? "Failed to start")
    }
  }

  async function onLogout() {
    try {
      setWaError("")
      setWa(await logoutWa())
    } catch (err: any) {
      setWaError(err?.message ?? "Failed to logout")
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    setSendError("")
    setSendId(null)
    setSendState("sending")
    try {
      const res = await sendWaMessage({ to, message })
      setSendId(res.id)
      setSendState("sent")
    } catch (err: any) {
      setSendError(err?.message ?? "Failed to send")
      setSendState("idle")
    }
  }

  return (
    <DashboardShell
      crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
      title="Settings"
      description="Connect WhatsApp for notifications, send test messages, and manage dropdown options used across all forms."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Connection / QR */}
        <div className="card-elevated animate-enter p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300">
                <MessageCircleIcon className="size-[18px]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">WhatsApp connection</h2>
                <p className="text-xs text-muted-foreground">via whatsapp-web.js</p>
              </div>
            </div>
            {wa && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${badge[wa.status]}`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {label[wa.status]}
              </span>
            )}
          </div>

          {waError && (
            <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">{waError}</p>
          )}
          {wa?.lastError && (
            <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
              {wa.lastError}
            </p>
          )}

          {wa?.status === "ready" ? (
            <div className="mt-4 rounded-2xl border border-emerald-600/20 bg-emerald-500/8 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2Icon className="size-4 text-emerald-600" />
                Connected as{" "}
                <span className="font-mono font-semibold tabular-nums">
                  +{wa.connectedNumber ?? "unknown"}
                </span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Session is saved — the QR is not needed again unless you
                log out.
              </p>
            </div>
          ) : wa?.qr ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wa.qr}
                alt="WhatsApp pairing QR code"
                className="size-60 rounded-2xl border border-border bg-white p-2 shadow-md sm:size-64"
              />
              <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground">
                Open WhatsApp → Settings → Linked devices → Link a device,
                then scan this code.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
              {wa ? (
                <QrCodeIcon className="size-5 shrink-0 text-muted-foreground" />
              ) : (
                <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                {wa
                  ? "Preparing WhatsApp client — a QR code will appear here."
                  : "Loading connection status…"}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStart}
            >
              Restart client
            </Button>
            {wa?.status === "ready" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={onLogout}
              >
                Log out
              </Button>
            )}
          </div>
        </div>

        {/* Test notification */}
        <div className="card-elevated animate-enter p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border bg-gradient-to-b from-primary/15 to-primary/5 text-primary">
              <SendIcon className="size-[18px]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Send test notification</h2>
              <p className="text-xs text-muted-foreground">
                Works only while status is Connected.
              </p>
            </div>
          </div>
          <form onSubmit={onSend} className="mt-5 flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="waTo">
                Phone (country code + number)
              </FieldLabel>
              <Input
                id="waTo"
                placeholder="e.g. 919876543210"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="waMsg">Message</FieldLabel>
              <textarea
                id="waMsg"
                rows={4}
                placeholder="e.g. Fee of ₹5000 is due on 10th."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                className="min-h-20 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-xs transition-all duration-200 outline-none placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"
              />
            </Field>
            {sendError && (
              <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">{sendError}</p>
            )}
            {sendState === "sent" && (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-600/20 bg-emerald-500/8 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2Icon className="size-4 shrink-0" />
                Message sent{sendId ? ` (id ${sendId})` : ""}.
              </p>
            )}
            <div>
              <Button
                type="submit"
                disabled={
                  sendState === "sending" || wa?.status !== "ready"
                }
              >
                {sendState === "sending" ? (
                  <>
                    <Loader2Icon data-icon="inline-start" className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <SendIcon data-icon="inline-start" /> Send via WhatsApp
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Dropdown options used by all forms */}
      <div className="card-elevated animate-enter p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border bg-gradient-to-b from-muted to-muted/40">
            <Settings2Icon className="size-[18px]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Dropdown options</h2>
            <p className="text-xs text-muted-foreground">
              Add or remove items. Forms pick up changes when opened.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {DROPDOWN_KEYS.map((key) => (
            <div key={key} className="rounded-2xl border border-border/70 bg-muted/25 p-4">
              <h3 className="text-[13px] font-semibold tracking-tight">
                {DROPDOWN_LABELS[key]}
              </h3>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(dropdowns?.[key] ?? []).map((o) => (
                  <span
                    key={o}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-1.5 pl-3 text-xs font-medium shadow-xs"
                  >
                    {o}
                    <button
                      type="button"
                      aria-label={`Remove ${o}`}
                      className="flex size-4.5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                      onClick={() => removeOption(key, o)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
                {(dropdowns?.[key] ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No items — add one below.
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder={`New ${DROPDOWN_LABELS[key].toLowerCase()} item`}
                  value={newValues[key]}
                  onChange={(e) =>
                    setNewValues((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addOption(key)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 self-center px-4"
                  onClick={() => addOption(key)}
                >
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden">
        <StatusBadge status="Active" />
      </div>
    </DashboardShell>
  )
}
