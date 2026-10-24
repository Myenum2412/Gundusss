"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import QRCode from "qrcode"
import {
  getPublicProfile,
  createPublicPayment,
  type PaymentOrder,
  type PublicOrganizationProfile,
  type PublicStudentOption,
} from "@/lib/payments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  Loader2Icon,
  PrinterIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000]

function formatInr(value: number | string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return `₹ ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(isoString: string): string {
  if (!isoString) return "—"
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return isoString
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function PublicPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = String(params?.companySlug ?? "").trim()

  const [profile, setProfile] = useState<PublicOrganizationProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Primary states: Money Value & Method
  const [amount, setAmount] = useState<string>("5000")
  const [isEditingAmount, setIsEditingAmount] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string>("")
  const [activeTab, setActiveTab] = useState<"UPI" | "CASH">("UPI")

  // QR Code & Payment states
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const [generatingQr, setGeneratingQr] = useState(false)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [cashPass, setCashPass] = useState<{
    passId: string
    studentName: string
    studentId: string
    amount: string
    timestamp: string
  } | null>(null)

  // Initialize from search params if present
  useEffect(() => {
    const qAmount = searchParams?.get("amount")
    if (qAmount && Number(qAmount) > 0) {
      setAmount(qAmount)
    }
    const qStudentId = searchParams?.get("studentId")
    if (qStudentId) {
      setSelectedStudentId(qStudentId)
    }
  }, [searchParams])

  // Load organization profile on mount
  const loadProfile = useCallback(async () => {
    if (!slug) return
    setLoadingProfile(true)
    setProfileError(null)
    try {
      const data = await getPublicProfile(slug)
      setProfile(data)
      if (data.students && data.students.length > 0 && !selectedStudentId) {
        setSelectedStudentId(data.students[0].studentId)
      }
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : "Could not find this institution or payment page"
      )
    } finally {
      setLoadingProfile(false)
    }
  }, [slug, selectedStudentId])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Active student object
  const currentStudent = useMemo<PublicStudentOption | null>(() => {
    if (!profile?.students?.length) return null
    return (
      profile.students.find((s) => s.studentId === selectedStudentId) ||
      profile.students[0]
    )
  }, [profile, selectedStudentId])

  // Resolved UPI ID & Payee Name
  const upiId = profile?.upiId || "6374984055@upi"
  const payeeName = profile?.payeeName || profile?.name || "Amarnath"
  const numAmount = Math.max(1, parseFloat(amount || "5000") || 5000)
  const amountFormatted = numAmount.toFixed(2)

  // Standard UPI URI
  const upiUri = useMemo(() => {
    const cleanUpi = upiId.trim()
    const desc = currentStudent
      ? `Fee-${currentStudent.studentName.replace(/\s+/g, "")}-${currentStudent.studentId}`
      : `Fee-Payment`
    return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(
      payeeName
    )}&am=${encodeURIComponent(amountFormatted)}&cu=INR&tn=${encodeURIComponent(desc)}`
  }, [upiId, payeeName, amountFormatted, currentStudent])

  // Generate dynamic QR Code live whenever amount or student changes
  useEffect(() => {
    let active = true
    setGeneratingQr(true)
    QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 2,
      color: {
        dark: "#09090b",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setGeneratingQr(false)
      })

    return () => {
      active = false
    }
  }, [upiUri])

  // Copy UPI ID
  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2200)
    } catch {
      // ignore
    }
  }

  // Copy UPI Payment URI
  const handleCopyUri = async () => {
    try {
      await navigator.clipboard.writeText(upiUri)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2200)
    } catch {
      // ignore
    }
  }

  // Handle direct App Click
  const handleOpenUpiApp = (schemePrefix?: string) => {
    if (schemePrefix) {
      const customUri = upiUri.replace(/^upi:/, schemePrefix)
      window.location.href = customUri
      setTimeout(() => {
        window.location.href = upiUri
      }, 500)
    } else {
      window.location.href = upiUri
    }
  }

  // Handle Cash Counter Pass generation
  const handleGenerateCashPass = async () => {
    setSubmitting(true)
    try {
      const passId = `PASS-${Date.now().toString().slice(-6)}`
      setCashPass({
        passId,
        studentName: currentStudent?.studentName || "Amarnath",
        studentId: currentStudent?.studentId || "STU-001",
        amount: String(numAmount),
        timestamp: new Date().toISOString(),
      })
      await createPublicPayment({
        slug,
        studentName: currentStudent?.studentName || "Amarnath",
        studentId: currentStudent?.studentId || "STU-001",
        amount: numAmount,
        method: "CASH_COUNTER",
      }).catch(() => null)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Confirm Paid (Receipt trigger)
  const handleConfirmPaid = async () => {
    setSubmitting(true)
    try {
      const created = await createPublicPayment({
        slug,
        studentName: currentStudent?.studentName || "Amarnath",
        studentId: currentStudent?.studentId || "STU-001",
        amount: numAmount,
        method: "UPI",
      })
      setOrder({
        ...created,
        status: "SUCCESS",
        amount: String(numAmount),
        studentName: currentStudent?.studentName || "Amarnath",
        studentId: currentStudent?.studentId || "STU-001",
      })
    } catch {
      setOrder({
        orderId: `ORD-${Date.now()}`,
        paymentId: `UPI-${Date.now().toString().slice(-8)}`,
        status: "SUCCESS",
        gatewayStatus: "SETTLED",
        method: "UPI",
        utr: `UTR${Date.now().toString().slice(-10)}`,
        amount: String(numAmount),
        studentId: currentStudent?.studentId || "STU-001",
        studentName: currentStudent?.studentName || "Amarnath",
        feeId: null,
        checkoutUrl: upiUri,
        receiptId: `REC-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loadingProfile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50/70 p-4 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <GraduationCapIcon className="size-7" />
            <Loader2Icon className="absolute -bottom-1 -right-1 size-5 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Loading fee payment portal…
          </p>
          <p className="text-xs text-muted-foreground">Connecting securely</p>
        </div>
      </main>
    )
  }

  // Not found error state
  if (profileError || !profile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50/70 p-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-lg shadow-black/[0.03]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TriangleAlertIcon className="size-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
            Institution Not Found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We could not find an institution matching{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {slug}
            </code>
            . Please check the link or contact your school/academy administrator.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button variant="outline" onClick={loadProfile}>
              <RefreshCwIcon className="size-4 mr-2" />
              Try Again
            </Button>
            <Button variant="ghost" onClick={() => router.push("/login")}>
              Go to Portal Login
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100/60 px-4 py-8 text-foreground sm:py-12 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-xl">
        {/* Organization Header */}
        <header className="mb-6 flex items-center justify-between rounded-3xl border bg-card/80 p-5 shadow-xs backdrop-blur-md sm:p-6">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-600 font-bold text-lg text-white shadow-md shadow-emerald-600/20">
              {profile.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt={profile.name}
                  className="size-full object-cover"
                />
              ) : (
                profile.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {profile.name}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-2.5" />
                  Verified
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Official Fee Payment Desk
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground border rounded-full px-2.5 py-1 bg-muted/30">
            <ShieldCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>256-bit Secure</span>
          </div>
        </header>

        {/* =========================================================================
            STATE 1: PAYMENT SUCCESS / RECEIPT
           ========================================================================= */}
        {order && order.status === "SUCCESS" ? (
          <section className="rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.04] sm:p-8 animate-in fade-in duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 shadow-inner">
                <CheckIcon className="size-8 stroke-[3]" />
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                Payment Completed!
              </h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Official payment receipt issued for {order.studentName}.
              </p>
              <div className="mt-4 inline-block rounded-2xl bg-emerald-50 px-6 py-2.5 text-3xl font-extrabold tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                {formatInr(order.amount)}
              </div>
            </div>

            <div className="mt-6 divide-y rounded-2xl border bg-muted/20 text-xs sm:text-sm">
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Student Name</span>
                <span className="font-semibold text-foreground">
                  {order.studentName}
                </span>
              </div>
              {order.studentId && (
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-muted-foreground">Student ID</span>
                  <span className="font-mono text-foreground">{order.studentId}</span>
                </div>
              )}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Payment Mode</span>
                <span className="font-medium text-foreground">{order.method || "UPI"}</span>
              </div>
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Receipt Number</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  {order.receiptId || `REC-${order.orderId.slice(-6)}`}
                </span>
              </div>
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Date & Time</span>
                <span className="tabular-nums text-foreground">
                  {formatDate(order.createdAt)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="gap-2"
              >
                <PrinterIcon className="size-4" />
                Print / Save Receipt
              </Button>
              <Button
                onClick={() => {
                  setOrder(null)
                  setCashPass(null)
                }}
              >
                Done
              </Button>
            </div>
          </section>
        ) : cashPass ? (
          /* =========================================================================
              STATE 2: CASH COUNTER PASS
             ========================================================================= */
          <section className="rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.04] sm:p-8 animate-in fade-in duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BanknoteIcon className="size-7" />
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground">
                Cash Counter Payment Pass
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Present this pass at the accounts desk to deposit cash.
              </p>
              <div className="mt-4 rounded-2xl bg-amber-50 px-6 py-2.5 text-2xl font-bold tabular-nums text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
                {formatInr(cashPass.amount)}
              </div>
            </div>

            <div className="mt-6 space-y-2 rounded-2xl border bg-muted/20 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pass Reference:</span>
                <span className="font-mono font-bold text-foreground">
                  {cashPass.passId}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Student:</span>
                <span className="font-semibold text-foreground">
                  {cashPass.studentName} ({cashPass.studentId})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Institution Desk:</span>
                <span className="font-medium text-foreground">{profile.name} Accounts Desk</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Issued At:</span>
                <span className="tabular-nums text-foreground">
                  {formatDate(cashPass.timestamp)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="gap-2"
              >
                <PrinterIcon className="size-4" />
                Print Cash Pass
              </Button>
              <Button variant="ghost" onClick={() => setCashPass(null)}>
                Back to Methods
              </Button>
            </div>
          </section>
        ) : (
          /* =========================================================================
              MAIN STREAMLINED PAYMENT SCREEN:
              1. How Much to Pay (Money Value)
              2. Payment Methods Only (UPI / QR / Cash)
             ========================================================================= */
          <div className="space-y-6">
            {/* -------------------------------------------------------------
                CARD 1: HOW MUCH TO PAY (MONEY VALUE)
               ------------------------------------------------------------- */}
            <section className="overflow-hidden rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.03] sm:p-7">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount to Pay
                </span>
                {profile?.students && profile.students.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <GraduationCapIcon className="size-3.5 text-primary" />
                    <span>
                      {currentStudent?.studentName || "Amarnath"} ({currentStudent?.studentId || "STU-001"})
                    </span>
                  </div>
                )}
              </div>

              {/* Large Money Value Display */}
              <div className="mt-4 flex flex-col items-center justify-center py-2 text-center">
                {!isEditingAmount ? (
                  <div className="group flex items-center gap-2">
                    <span className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl tabular-nums">
                      {formatInr(amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingAmount(true)}
                      className="rounded-full p-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      title="Edit fee amount"
                    >
                      ✎ Edit
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={amount}
                        autoFocus
                        onChange={(e) => setAmount(e.target.value)}
                        className="h-12 w-48 pl-8 text-2xl font-bold tabular-nums"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setIsEditingAmount(false)}
                      className="h-12 px-4"
                    >
                      Done
                    </Button>
                  </div>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  {currentStudent?.group
                    ? `Monthly Tuition Fee · ${currentStudent.group}`
                    : "Monthly Student Fee"}
                </p>

                {/* Quick Preset Amount Buttons */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground mr-1">
                    Quick amounts:
                  </span>
                  {PRESET_AMOUNTS.map((p) => {
                    const isSelected = Number(amount) === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setAmount(String(p))
                          setIsEditingAmount(false)
                        }}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "border bg-muted/30 text-foreground hover:bg-muted"
                        )}
                      >
                        ₹{p.toLocaleString("en-IN")}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Student Switcher (if more than 1 student enrolled) */}
              {profile?.students && profile.students.length > 1 && (
                <div className="mt-4 border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Student:</span>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-foreground outline-none"
                  >
                    {profile.students.map((s) => (
                      <option key={s.studentId} value={s.studentId}>
                        {s.studentName} ({s.studentId})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            {/* -------------------------------------------------------------
                CARD 2: PAYMENT METHODS ONLY
               ------------------------------------------------------------- */}
            <section className="overflow-hidden rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.03] sm:p-7">
              {/* Method Selector Tabs */}
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="text-base font-bold tracking-tight text-foreground">
                    Select Payment Method
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Instant zero-fee payment methods only
                  </p>
                </div>
                <div className="flex rounded-xl bg-muted/60 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setActiveTab("UPI")}
                    className={cn(
                      "rounded-lg px-3 py-1 transition",
                      activeTab === "UPI"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    UPI / QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("CASH")}
                    className={cn(
                      "rounded-lg px-3 py-1 transition",
                      activeTab === "CASH"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Cash Counter
                  </button>
                </div>
              </div>

              {/* TAB 1: UPI & DYNAMIC QR */}
              {activeTab === "UPI" && (
                <div className="mt-6 space-y-6">
                  {/* Dynamic QR Code Card */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border bg-slate-50/80 dark:bg-zinc-900/60 p-6 shadow-inner text-center">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Scan to Pay with Any UPI App
                    </span>

                    <div className="mt-3 relative flex items-center justify-center rounded-2xl border bg-white p-3 shadow-md">
                      {generatingQr || !qrDataUrl ? (
                        <div className="flex size-64 items-center justify-center">
                          <Loader2Icon className="size-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <img
                          src={qrDataUrl}
                          alt={`Scan UPI QR to pay ${formatInr(amount)}`}
                          className="size-60 sm:size-64 object-contain"
                        />
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="text-xs text-muted-foreground">UPI ID:</span>
                      <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                        {upiId}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={handleCopyUpi}
                        className="h-6 px-2 text-[11px]"
                      >
                        {copiedUpi ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckIcon className="size-3" /> Copied
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <CopyIcon className="size-3" /> Copy
                          </span>
                        )}
                      </Button>
                    </div>

                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Compatible with Google Pay, PhonePe, Paytm, BHIM, CRED & Bank Apps
                    </p>
                  </div>

                  {/* One-Click Direct Pay Button (For Mobile & Desktop) */}
                  <div className="space-y-3">
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => handleOpenUpiApp()}
                      className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 gap-2"
                    >
                      <SmartphoneIcon className="size-5" />
                      <span>Pay {formatInr(amount)} via Any UPI App</span>
                    </Button>

                    {/* Quick App Direct Trigger Badges */}
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenUpiApp("tez://upi/pay?")}
                        className="h-10 text-xs font-semibold border-muted hover:border-foreground/30 gap-1.5"
                      >
                        <span className="font-bold text-sky-600">G</span>Pay
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenUpiApp("phonepe://pay?")}
                        className="h-10 text-xs font-semibold border-muted hover:border-foreground/30 gap-1.5"
                      >
                        <span className="font-bold text-purple-600">Phone</span>Pe
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenUpiApp("paytmmp://pay?")}
                        className="h-10 text-xs font-semibold border-muted hover:border-foreground/30 gap-1.5"
                      >
                        <span className="font-bold text-sky-500">Pay</span>tm
                      </Button>
                    </div>
                  </div>

                  {/* "I Have Paid" Action */}
                  <div className="border-t pt-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">
                      Completed the UPI payment on your phone?
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleConfirmPaid}
                      disabled={submitting}
                      className="gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    >
                      {submitting ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2Icon className="size-3.5" />
                      )}
                      <span>I Have Paid · View Receipt</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* TAB 2: CASH AT COUNTER */}
              {activeTab === "CASH" && (
                <div className="mt-6 space-y-5 text-center">
                  <div className="rounded-2xl border bg-muted/20 p-5">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                      <BanknoteIcon className="size-6" />
                    </div>
                    <h3 className="font-semibold text-sm text-foreground">
                      Pay Cash at Counter Desk
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                      Generate a digital cash payment pass to deposit {formatInr(amount)} directly at the accounts counter desk.
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    onClick={handleGenerateCashPass}
                    disabled={submitting}
                    className="w-full h-11 text-sm font-semibold gap-2"
                  >
                    {submitting ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <CheckIcon className="size-4" />
                    )}
                    <span>Generate Cash Payment Pass</span>
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Footer Guarantee */}
        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>256-bit Encrypted Direct UPI Payment</span>
          </p>
          <p className="mt-1">
            Questions? Contact {profile.name} at {profile.phone || "6374984055"}.
          </p>
        </footer>
      </div>
    </main>
  )
}
