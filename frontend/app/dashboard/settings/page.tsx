"use client"

import { useCallback, useEffect, useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  getWaStatus,
  logoutWa,
  sendWaMessage,
  startWa,
  type WaState,
} from "@/lib/api"

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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              WhatsApp notifications via whatsapp-web.js (wwebjs.dev).
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Connection / QR */}
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">WhatsApp connection</h2>
                {wa && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge[wa.status]}`}
                  >
                    {label[wa.status]}
                  </span>
                )}
              </div>

              {waError && (
                <p className="mt-3 text-sm text-destructive">{waError}</p>
              )}
              {wa?.lastError && (
                <p className="mt-3 text-sm text-destructive">
                  {wa.lastError}
                </p>
              )}

              {wa?.status === "ready" ? (
                <div className="mt-4">
                  <p className="text-sm">
                    Connected as{" "}
                    <span className="font-medium">
                      +{wa.connectedNumber ?? "unknown"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Session is saved — the QR is not needed again unless you
                    log out.
                  </p>
                </div>
              ) : wa?.qr ? (
                <div className="mt-4 flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={wa.qr}
                    alt="WhatsApp pairing QR code"
                    className="size-64 rounded-lg border"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Open WhatsApp → Settings → Linked devices → Link a device,
                    then scan this code.
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {wa
                    ? "Preparing WhatsApp client — a QR code will appear here."
                    : "Loading connection status…"}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                >
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
                    variant="outline"
                    size="sm"
                    onClick={onLogout}
                  >
                    Log out
                  </Button>
                )}
              </div>
            </div>

            {/* Test notification */}
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <h2 className="text-sm font-semibold">Send test notification</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Works only while status is Connected.
              </p>
              <form onSubmit={onSend} className="mt-4 flex flex-col gap-4">
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
                    className="min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                  />
                </Field>
                {sendError && (
                  <p className="text-sm text-destructive">{sendError}</p>
                )}
                {sendState === "sent" && (
                  <p className="text-sm text-green-600">
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
                    {sendState === "sending" ? "Sending…" : "Send via WhatsApp"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
