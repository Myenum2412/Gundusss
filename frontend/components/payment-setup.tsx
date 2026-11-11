"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  getPaymentSettings,
  getPreviewQr,
  savePaymentSettings,
  type PaymentSettings,
} from "@/lib/payments"
import { useAuth } from "@/components/auth-provider"
import { cn } from "cn"
import {
  CircleCheckIcon,
  ImageIcon,
  Loader2Icon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  WalletIcon,
} from "lucide-react"

const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
const MAX_QR_BYTES = 2 * 1024 * 1024

const UPI_APPS = [
  { name: "Google Pay", short: "Google Pay", icon: "/upi-apps/gpay.png" },
  { name: "PhonePe", short: "PhonePe", icon: "/upi-apps/phonepe.png" },
  { name: "Paytm", short: "Paytm", icon: "/upi-apps/paytm.png" },
  { name: "BHIM UPI", short: "BHIM", icon: "/upi-apps/bhim.png" },
] as const

function formatAmount(value: number) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function PaymentSetup({ onSaved }: { onSaved?: () => void }) {
  const { activeProfile } = useAuth()
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [upiId, setUpiId] = useState("")
  const [payeeName, setPayeeName] = useState("")
  const [qr, setQr] = useState("")
  const [previewQr, setPreviewQr] = useState("")
  const [previewAmount, setPreviewAmount] = useState("2500")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<"success" | "warning">("success")
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await getPaymentSettings()
      setSettings(next)
      setUpiId(next.upiId ?? "")
      setPayeeName(next.payeeName ?? "")
      setQr(next.qrCodeDataUrl ?? "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load UPI settings.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Generate a QR for the form values before they are saved. An uploaded QR
  // always takes precedence, because that is the merchant's real bank QR.
  useEffect(() => {
    if (qr) {
      setPreviewQr("")
      return
    }
    const vpa = upiId.trim()
    if (!VPA_RE.test(vpa)) {
      setPreviewQr("")
      return
    }

    let active = true
    const amount = Number(previewAmount)
    const qrAmount =
      Number.isFinite(amount) && amount > 0 ? amount : undefined
    const timer = setTimeout(() => {
      getPreviewQr(vpa, payeeName.trim(), qrAmount)
        .then((result) => {
          if (active) setPreviewQr(result.qrDataUrl || "")
        })
        .catch(() => {
          if (active) setPreviewQr("")
        })
    }, 350)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [upiId, payeeName, qr, previewAmount])

  function readFile(file: File) {
    setError(null)
    setNotice(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Upload a PNG, JPG or WebP image.")
      return
    }
    if (file.size > MAX_QR_BYTES) {
      setError("QR image must be 2 MB or smaller.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result.startsWith("data:image/")) {
        setError("Could not read that image.")
        return
      }
      setQr(result)
      setNotice("QR image ready. Save the setup to apply it.")
    }
    reader.onerror = () => setError("Could not read that image.")
    reader.readAsDataURL(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) readFile(file)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    const cleanUpi = upiId.trim()
    if (!VPA_RE.test(cleanUpi)) {
      setError("Enter a valid UPI ID, for example school@okhdfcbank.")
      setSaving(false)
      return
    }

    try {
      const next = await savePaymentSettings({
        upiId: cleanUpi,
        payeeName: payeeName.trim(),
        qrCodeDataUrl: qr,
      })
      setSettings(next)
      setUpiId(next.upiId)
      setPayeeName(next.payeeName)
      setQr(next.qrCodeDataUrl)
      setNoticeTone("success")
      setNotice(
        `Saved for ${activeProfile.name}. Your public payment page now shows this UPI ID and QR.`
      )
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save UPI settings.")
    } finally {
      setSaving(false)
    }
  }

  const displayQr = qr || previewQr || settings?.generatedQrDataUrl || ""
  const amount = Number(previewAmount)
  const previewAmountLabel = Number.isFinite(amount) ? formatAmount(amount) : "0.00"

  return (
    <Card className="overflow-visible">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <WalletIcon className="size-4" />
              </span>
              UPI payment setup
            </CardTitle>
            <CardDescription className="mt-1">
              Add the UPI ID and QR code for {activeProfile.name}. This setup is
              private to your workspace and is never shared with other
              organizations.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-emerald-600/15 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <ShieldCheckIcon className="size-3.5" />
              Only {activeProfile.name}
            </span>
            <Button
              type="button"
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
      </CardHeader>

      <CardContent className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-5">
        <form className="flex flex-col gap-5" onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="payment-upi-id">UPI ID</FieldLabel>
              <Input
                id="payment-upi-id"
                value={upiId}
                onChange={(event) => setUpiId(event.target.value)}
                placeholder="school@okhdfcbank"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={Boolean(upiId) && !VPA_RE.test(upiId.trim())}
              />
              <FieldDescription>
                The UPI ID that receives fee payments for this workspace only.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="payment-payee-name">Payee name</FieldLabel>
              <Input
                id="payment-payee-name"
                value={payeeName}
                onChange={(event) => setPayeeName(event.target.value)}
                placeholder="MyFees"
                maxLength={120}
              />
              <FieldDescription>
                Shown in the UPI app while the student pays.
              </FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel>Merchant QR code</FieldLabel>
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col gap-4 rounded-xl border border-dashed p-4 transition-colors sm:flex-row sm:items-center",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/20"
              )}
            >
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white p-1.5">
                {qr ? (
                  <img
                    src={qr}
                    alt="Uploaded merchant QR"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <QrCodeIcon className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {qr ? "Custom QR uploaded" : "Upload your bank QR"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  PNG, JPG or WebP · up to 2 MB. If omitted, a QR is generated
                  from the UPI ID for the preview.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <UploadIcon />
                    {qr ? "Replace QR" : "Upload QR"}
                  </Button>
                  {qr && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQr("")
                        setNotice("Custom QR removed. The generated QR will be used in the preview.")
                      }}
                    >
                      <Trash2Icon />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) readFile(file)
                  event.target.value = ""
                }}
              />
            </div>
            <FieldDescription>
              Upload your bank or merchant QR. It appears as-is on this
              workspace&apos;s public payment page. If you skip it, a QR is
              generated from the UPI ID above.
            </FieldDescription>
          </Field>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Supported UPI apps
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Students can pay from any UPI app. These six are highlighted at
                  checkout.
                </p>
              </div>
              <span className="inline-flex h-6 items-center rounded-full border bg-background px-2.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {UPI_APPS.length} APPS
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {UPI_APPS.map((app) => (
                <div
                  key={app.name}
                  title={app.name}
                  className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-background px-1.5 py-2.5 text-center"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-white p-1.5">
                    <img
                      src={app.icon}
                      alt={`${app.name} logo`}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </span>
                  <span className="w-full truncate text-[10px] font-medium leading-tight text-foreground">
                    {app.short}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              Students can pay from any UPI app by scanning the QR or using the
              UPI ID. Your uploaded QR is shown to payers exactly as provided.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={saving || loading}>
              {saving ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
              {saving ? "Saving…" : "Save payment setup"}
            </Button>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!error && notice && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                noticeTone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
              )}
            >
              {noticeTone === "success" ? (
                <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
              ) : (
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1">{notice}</span>
            </div>
          )}
        </form>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Payment page preview</p>
              <p className="text-xs text-muted-foreground">
                What students see on your public payment page.
              </p>
            </div>
            <span className="inline-flex h-6 items-center rounded-full border bg-background px-2.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
              LIVE PREVIEW
            </span>
          </div>

          <div className="mx-auto w-full max-w-[330px] overflow-hidden rounded-[24px] border bg-card shadow-sm">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-white/10">
                  <WalletIcon className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold leading-tight">MyFees</p>
                  <p className="text-[10px] leading-tight text-white/60">
                    Secure UPI checkout
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-medium text-white/80">
                PREVIEW
              </span>
            </div>

            <div className="space-y-4 p-4">
              <div className="text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Paying
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  ₹ {previewAmountLabel}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {payeeName.trim() || "Your business name"}
                </p>
              </div>

              <div className="mx-auto grid aspect-square w-full max-w-[188px] place-items-center rounded-2xl border bg-white p-3 shadow-inner">
                {displayQr ? (
                  <img
                    src={displayQr}
                    alt="UPI QR preview"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-3 text-center">
                    <QrCodeIcon className="size-10 text-slate-300" />
                    <p className="text-[11px] leading-snug text-slate-500">
                      Add a UPI ID to generate the payment QR.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center">
                <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  UPI ID
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-foreground">
                  {upiId.trim() || "name@bank"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-center text-[10px] leading-snug text-muted-foreground">
                  <SmartphoneIcon className="size-3.5 shrink-0" />
                  Scan with any UPI app
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  {UPI_APPS.map((app) => (
                    <span
                      key={app.name}
                      title={app.name}
                      className="grid size-6 place-items-center rounded-md border bg-white p-0.5"
                    >
                      <img
                        src={app.icon}
                        alt={app.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheckIcon className="size-3.5" />
                Scan with any UPI app · no card details
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2">
            <label
              htmlFor="preview-amount"
              className="text-xs font-medium text-muted-foreground"
            >
              Preview amount
            </label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">₹</span>
              <Input
                id="preview-amount"
                type="number"
                min="1"
                step="0.01"
                value={previewAmount}
                onChange={(event) => setPreviewAmount(event.target.value)}
                className="h-7 w-24 text-right text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            <ImageIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {qr
                ? "This is your uploaded QR. It is shown as-is to students paying this workspace."
                : "This QR is generated from your UPI ID. Upload your bank QR to use your own artwork."}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
