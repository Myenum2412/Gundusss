"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import Stats01 from "@/components/stats-01"
import { LiveBadge } from "@/components/live-badge"
import { isSyncing, sameJson } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
import { CheckCircle2Icon, PlugIcon, SendIcon } from "lucide-react"

const waLabel: Record<WaState["status"], string> = {
  idle: "Not started",
  starting: "Starting",
  qr: "Scan QR",
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

  const reloadDropdowns = useCallback(() => {
    if (isSyncing()) return
    loadDropdowns().then((map) => {
      if (isSyncing()) return
      setDropdowns((prev) => (sameJson(prev, map) ? prev : map))
    })
  }, [])

  useEffect(() => {
    reloadDropdowns()
  }, [reloadDropdowns])

  useLiveReload(reloadDropdowns)

  function addOption(key: DropdownKey) {
    const value = newValues[key].trim()
    if (!value) return
    setDropdowns((prev) => {
      if (!prev || prev[key].includes(value)) return prev
      const next = { ...prev, [key]: [...prev[key], value] }
      void saveDropdowns(next)
      return next
    })
    setNewValues((prev) => ({ ...prev, [key]: "" }))
  }

  function removeOption(key: DropdownKey, value: string) {
    setDropdowns((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: prev[key].filter((o) => o !== value) }
      void saveDropdowns(next)
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
    <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}>
      <PageHeader
        title="Settings"
        description="WhatsApp notifications via whatsapp-web.js, plus dropdown options used across all forms."
        meta={<LiveBadge />}
      />

      <Stats01
        stats={[
          {
            name: "Option lists",
            value: String(DROPDOWN_KEYS.length),
            change: "across all forms",
            changeType: "neutral",
          },
          {
            name: "Total options",
            value: String(
              dropdowns ? DROPDOWN_KEYS.reduce((sum, k) => sum + (dropdowns[k]?.length ?? 0), 0) : 0
            ),
            change: "forms update live",
            changeType: "neutral",
          },
          {
            name: "WhatsApp",
            value:
              wa?.status === "ready"
                ? "Connected"
                : wa?.status === "qr"
                  ? "Scan QR"
                  : wa?.status === "starting"
                    ? "Starting"
                    : wa?.status === "error"
                      ? "Error"
                      : "Offline",
            change: wa?.connectedNumber ? `+${wa.connectedNumber}` : "live status",
            changeType: wa?.status === "ready" ? "positive" : "neutral",
          },
          {
            name: "Forms using options",
            value: "4",
            change: "auto-updated",
            changeType: "neutral",
          },
        ]}
      />

      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        {/* Connection / QR */}
        <section className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
              <PlugIcon className="size-4 text-muted-foreground" />
              WhatsApp connection
            </h2>
            {wa && <StatusBadge value={waLabel[wa.status]} />}
          </div>

          {waError && <p className="mt-3 text-sm text-destructive">{waError}</p>}
          {wa?.lastError && <p className="mt-3 text-sm text-destructive">{wa.lastError}</p>}

          {wa?.status === "ready" ? (
            <div className="mt-4 rounded-xl border bg-emerald-50/60 p-4 dark:bg-emerald-500/5">
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2Icon className="size-4 text-emerald-600" />
                Connected as <span className="font-semibold">+{wa.connectedNumber ?? "unknown"}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Session is saved — the QR is not needed again unless you log out.
              </p>
            </div>
          ) : wa?.qr ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wa.qr}
                alt="WhatsApp pairing QR code"
                className="size-60 rounded-xl border bg-white p-2"
              />
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                Open WhatsApp → Settings → Linked devices → Link a device, then scan this code.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {wa ? "Preparing WhatsApp client — a QR code will appear here." : "Loading connection status…"}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              Refresh
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onStart}>
              Restart client
            </Button>
            {wa?.status === "ready" && (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onLogout}>
                Log out
              </Button>
            )}
          </div>
        </section>

        {/* Test notification */}
        <section className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
            <SendIcon className="size-4 text-muted-foreground" />
            Send test notification
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Works only while status is Connected.</p>
          <form onSubmit={onSend} className="mt-4 flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="waTo">Phone (country code + number)</FieldLabel>
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
                className="min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </Field>
            {sendError && <p className="text-sm text-destructive">{sendError}</p>}
            {sendState === "sent" && (
              <p className="rounded-lg border border-emerald-600/15 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Message sent{sendId ? ` (id ${sendId})` : ""}.
              </p>
            )}
            <div>
              <Button type="submit" disabled={sendState === "sending" || wa?.status !== "ready"}>
                {sendState === "sending" ? "Sending…" : "Send via WhatsApp"}
              </Button>
            </div>
          </form>
        </section>
      </div>

      {/* Dropdown options used by all forms */}
      <section className="shrink-0 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <h2 className="text-[13px] font-semibold tracking-tight">Dropdown options</h2>
        <p className="mt-1 text-xs text-muted-foreground">Add or remove items. Forms pick up changes when opened.</p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {DROPDOWN_KEYS.map((key) => (
            <div key={key} className="rounded-xl border bg-background p-4">
              <h3 className="text-[13px] font-medium">{DROPDOWN_LABELS[key]}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(dropdowns?.[key] ?? []).map((o) => (
                  <span
                    key={o}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium"
                  >
                    {o}
                    <button
                      type="button"
                      aria-label={`Remove ${o}`}
                      className="app-transition flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => removeOption(key, o)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(dropdowns?.[key] ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">No items — add one below.</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder={`New ${DROPDOWN_LABELS[key].toLowerCase()} item`}
                  value={newValues[key]}
                  onChange={(e) => setNewValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addOption(key)
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 self-center" onClick={() => addOption(key)}>
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  )
}
