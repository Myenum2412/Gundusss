"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import QRCode from "qrcode"
import {
  getPublicProfile,
  createPublicPayment,
  getPublicPaymentStatus,
  type PaymentOrder,
  type PublicOrganizationProfile,
  type PublicStudentOption,
} from "@/lib/payments"
import {
  buildUpiPaymentUri,
  isUsableUpiVpa,
  toUpiAppUri,
  type UpiApp,
} from "@/lib/upi"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  GraduationCapIcon,
  Loader2Icon,
  PrinterIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  WalletIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  SvglGoogle,
  SvglPhonePe,
  SvglPaytm,
  SvglPaytmIcon,
  SvglUpi,
  SvglBhim,
  SvglCash,
} from "@/components/icons/payment-icons"

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

  // Student identifier query (e.g. ?student=gunduss, ?student=STU-002, ?student=amarnath)
  const targetStudentQuery = (
    searchParams?.get("student") ||
    searchParams?.get("studentId") ||
    searchParams?.get("user") ||
    searchParams?.get("id") ||
    ""
  ).trim()

  const [selectedStudentId, setSelectedStudentId] = useState<string>("")
  const [activeTab, setActiveTab] = useState<"UPI" | "CASH">("UPI")

  // QR & Status states
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const [generatingQr, setGeneratingQr] = useState(false)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cashError, setCashError] = useState<string | null>(null)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [cashPass, setCashPass] = useState<{
    passId: string
    studentName: string
    studentId: string
    amount: string
    timestamp: string
  } | null>(null)

  // Load organization profile
  const loadProfile = useCallback(async () => {
    if (!slug) return
    setLoadingProfile(true)
    setProfileError(null)
    try {
      const data = await getPublicProfile(slug)
      setProfile(data)
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : "Could not find this institution or payment page"
      )
    } finally {
      setLoadingProfile(false)
    }
  }, [slug])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Resolve active student: either matched from URL parameter (?student=gunduss / STU-002), or user selected
  const activeStudent = useMemo<PublicStudentOption | null>(() => {
    if (!profile?.students?.length) return null

    // 1. If explicit query parameter in URL, match it strictly
    if (targetStudentQuery) {
      const clean = targetStudentQuery.toLowerCase()
      const found = profile.students.find(
        (s) =>
          s.studentId.toLowerCase() === clean ||
          s.studentName.toLowerCase() === clean ||
          s.studentName.toLowerCase().replace(/\s+/g, "") === clean ||
          s.phone.replace(/\D/g, "") === clean
      )
      if (found) return found
    }

    // 2. If user manually selected a student
    if (selectedStudentId) {
      const found = profile.students.find((s) => s.studentId === selectedStudentId)
      if (found) return found
    }

    // 3. Default to first student
    return profile.students[0]
  }, [profile, targetStudentQuery, selectedStudentId])

  // Fixed fee amount for the specific user/student (no arbitrary editing / cannot create own)
  const fixedAmount = useMemo(() => {
    if (activeStudent?.feeAmount && Number(activeStudent.feeAmount) > 0) {
      return activeStudent.feeAmount
    }
    return "5000"
  }, [activeStudent])

  // Never synthesise a VPA from the organisation phone number. A phone number
  // is not a UPI handle, so the old `${phone}@upi` fallback sent payers to an
  // address that does not exist. If the office has not saved a merchant VPA,
  // the page must say so and offer the counter instead.
  const upiId = isUsableUpiVpa(profile?.upiId) ? profile.upiId.trim() : ""
  const upiConfigured = Boolean(upiId)
  const payeeName = profile?.payeeName || profile?.name || "Institution Office"
  const numAmount = parseFloat(fixedAmount) || 0
  const amountFormatted = numAmount.toFixed(2)

  // Construct a canonical UPI payment URI for that specific student and fee.
  const upiUri = useMemo(() => {
    if (!upiId) return ""
    const studentNote = activeStudent
      ? `Fee-${activeStudent.studentName.replace(/\s+/g, "")}-${activeStudent.studentId}`
      : `Fee-Payment`
    try {
      return buildUpiPaymentUri({
        vpa: upiId,
        payeeName,
        amount: amountFormatted,
        note: studentNote,
      })
    } catch {
      return ""
    }
  }, [upiId, payeeName, amountFormatted, activeStudent])

  // If no merchant UPI ID is configured, start on the counter tab instead of
  // presenting a QR that cannot be paid.
  useEffect(() => {
    if (profile && !upiConfigured) setActiveTab("CASH")
  }, [profile, upiConfigured])

  // Generate dynamic QR Code live for that specific student fee
  useEffect(() => {
    let active = true
    if (!upiUri) {
      setQrDataUrl("")
      setGeneratingQr(false)
      return () => {
        active = false
      }
    }

    setGeneratingQr(true)
    QRCode.toDataURL(upiUri, {
      width: 260,
      margin: 1,
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

  // Strict payment status verification: ONLY allow completed status if backend confirms SUCCESS or COMPLETED
  const queryOrderId = (searchParams?.get("orderId") || "").trim()

  useEffect(() => {
    if (!queryOrderId) return
    let active = true

    const verifyServerPayment = async () => {
      try {
        const orderData = await getPublicPaymentStatus(queryOrderId)
        if (!active) return
        if (
          orderData &&
          (orderData.status === "SUCCESS" || orderData.status === "COMPLETED")
        ) {
          setOrder(orderData)
        }
      } catch {
        // Without verified payment status, do not set completed status
      }
    }

    verifyServerPayment()
    const timer = setInterval(verifyServerPayment, 3500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [queryOrderId])

  // Select student and synchronize URL parameter
  const handleSelectStudent = (stu: PublicStudentOption) => {
    setSelectedStudentId(stu.studentId)
    router.replace(`/${slug}?student=${encodeURIComponent(stu.studentId)}`)
  }

  // Copy UPI ID
  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2000)
    } catch {
      // ignore
    }
  }

  // Open in UPI App. Each app scheme expects the query directly after `?`;
  // replacing the `upi:` prefix on the whole URI produced `...pay?//pay?`.
  const handleOpenUpiApp = (app: UpiApp = "generic") => {
    if (!upiUri) return
    window.location.href = toUpiAppUri(upiUri, app)
  }

  // Cash pass generation. The pass is only shown after the backend accepts the
  // order; a locally fabricated pass could never be confirmed at the counter.
  const handleGenerateCashPass = async () => {
    if (!activeStudent) {
      setCashError("Select a student before generating a cash pass.")
      return
    }
    setSubmitting(true)
    setCashError(null)
    setCashPass(null)
    try {
      const created = await createPublicPayment({
        slug,
        studentName: activeStudent.studentName,
        studentId: activeStudent.studentId,
        amount: numAmount,
        method: "CASH_COUNTER",
      })
      setCashPass({
        passId: created.orderId,
        studentName: created.studentName || activeStudent.studentName,
        studentId: created.studentId || activeStudent.studentId,
        amount: created.amount || fixedAmount,
        timestamp: created.createdAt || new Date().toISOString(),
      })
    } catch (err) {
      setCashError(
        err instanceof Error
          ? err.message
          : "Could not generate a cash pass. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loadingProfile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50/70 p-4 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <WalletIcon className="size-6" />
            <Loader2Icon className="absolute -bottom-1 -right-1 size-4 animate-spin text-emerald-600" />
          </div>
          <p className="text-xs font-semibold text-foreground">
            Connecting to secure checkout…
          </p>
        </div>
      </main>
    )
  }

  // Not found error state
  if (profileError || !profile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50/70 p-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm rounded-3xl border bg-card p-6 text-center shadow-lg shadow-black/[0.03]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <TriangleAlertIcon className="size-6" />
          </div>
          <h1 className="mt-3 text-base font-bold text-foreground">
            Institution Not Found
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Could not find payment page for{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {slug}
            </code>
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={loadProfile}>
              <RefreshCwIcon className="size-3.5 mr-1.5" />
              Try Again
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-100/80 via-slate-50 to-slate-100/60 p-3 sm:p-5 text-foreground dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-[390px] transition-all">
        {/* =========================================================================
            STATE 1: PAYMENT SUCCESS / RECEIPT (STRICT: ONLY ON VERIFIED STATUS)
           ========================================================================= */}
        {order && (order.status === "SUCCESS" || order.status === "COMPLETED") ? (
          <section className="overflow-hidden rounded-[26px] border bg-card shadow-xl shadow-black/[0.04] animate-in fade-in zoom-in-95 duration-200">
            {/* YOUPI PG Header */}
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white dark:bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <WalletIcon className="size-3.5" />
                </span>
                <div>
                  <p className="text-xs font-bold leading-tight">YOUPI PG</p>
                  <p className="text-[9px] leading-tight text-white/60">
                    Payment Receipt
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
                VERIFIED
              </span>
            </div>

            <div className="p-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                <CheckIcon className="size-6 stroke-[3]" />
              </div>
              <h2 className="mt-2.5 text-lg font-bold text-foreground">
                Payment Successful!
              </h2>
              <p className="text-xs text-muted-foreground">
                Official receipt for {order.studentName}
              </p>
              <div className="mt-3 inline-block rounded-xl bg-emerald-50 px-4 py-1.5 text-2xl font-black tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                {formatInr(order.amount)}
              </div>

              <div className="mt-4 divide-y rounded-xl border bg-muted/20 text-xs text-left">
                <div className="flex justify-between p-2.5">
                  <span className="text-muted-foreground">Student</span>
                  <span className="font-semibold text-foreground">
                    {order.studentName} ({order.studentId})
                  </span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-muted-foreground">Receipt</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {order.receiptId || `REC-${order.orderId.slice(-6)}`}
                  </span>
                </div>
                <div className="flex justify-between p-2.5">
                  <span className="text-muted-foreground">Date</span>
                  <span className="text-foreground">{formatDate(order.createdAt)}</span>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="w-1/2 gap-1.5 text-xs"
                >
                  <PrinterIcon className="size-3.5" />
                  Print
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setOrder(null)
                    setCashPass(null)
                  }}
                  className="w-1/2 text-xs"
                >
                  Done
                </Button>
              </div>
            </div>
          </section>
        ) : cashPass ? (
          /* =========================================================================
              STATE 2: CASH COUNTER PASS
             ========================================================================= */
          <section className="overflow-hidden rounded-[26px] border bg-card shadow-xl shadow-black/[0.04] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white dark:bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-amber-500/20 text-amber-400">
                  <SvglCash className="size-3.5" />
                </span>
                <div>
                  <p className="text-xs font-bold leading-tight">Cash Counter Pass</p>
                  <p className="text-[9px] leading-tight text-white/60">
                    Accounts Desk Slip
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
                CASH PASS
              </span>
            </div>

            <div className="p-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                <SvglCash className="size-6" />
              </div>
              <h2 className="mt-2.5 text-base font-bold text-foreground">
                Deposit Pass Generated
              </h2>
              <p className="text-xs text-muted-foreground">
                Pay at {profile.name} Accounts Desk
              </p>
              <div className="mt-3 inline-block rounded-xl bg-amber-50 px-4 py-1.5 text-2xl font-black tabular-nums text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
                {formatInr(cashPass.amount)}
              </div>

              <div className="mt-4 space-y-1.5 rounded-xl border bg-muted/20 p-3 text-xs text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pass Code:</span>
                  <span className="font-mono font-bold text-foreground">
                    {cashPass.passId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student:</span>
                  <span className="font-semibold text-foreground">
                    {cashPass.studentName} ({cashPass.studentId})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time:</span>
                  <span className="text-foreground">{formatDate(cashPass.timestamp)}</span>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="w-1/2 gap-1.5 text-xs"
                >
                  <PrinterIcon className="size-3.5" />
                  Print Pass
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCashPass(null)}
                  className="w-1/2 text-xs"
                >
                  Back
                </Button>
              </div>
            </div>
          </section>
        ) : (
          /* =========================================================================
              MAIN SHORT & SWEET CHECKOUT CARD
             ========================================================================= */
          <div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-card shadow-xl shadow-black/[0.05] dark:border-zinc-800">
            {/* 1. YOUPI PG Banner */}
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white dark:bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <WalletIcon className="size-3.5" />
                </span>
                <div>
                  <p className="text-xs font-bold leading-tight tracking-wide">YOUPI PG</p>
                  <p className="text-[9px] leading-tight text-white/60">
                    Secure UPI checkout
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-white/80">
                PREVIEW
              </span>
            </div>

            {/* 2. Compact Payee & Fee Header */}
            <div className="border-b bg-muted/20 px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-xs font-bold text-foreground">
                  {profile.name}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-2.5" /> Verified
                </span>
              </div>

              {/* Student Tag */}
              {activeStudent && (
                <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <GraduationCapIcon className="size-3 text-primary" />
                  <span className="font-semibold text-foreground">
                    {activeStudent.studentName}
                  </span>
                  <span>({activeStudent.studentId})</span>
                </div>
              )}

              {/* Student Quick Switcher (If multiple students) */}
              {profile?.students && profile.students.length > 1 && (
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  {profile.students.map((s) => {
                    const isSelected = activeStudent?.studentId === s.studentId
                    return (
                      <button
                        key={s.studentId}
                        type="button"
                        onClick={() => handleSelectStudent(s)}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition",
                          isSelected
                            ? "bg-foreground text-background font-bold shadow-2xs"
                            : "bg-muted/80 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {s.studentName}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Large Due Fee Amount */}
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Fee Amount to Pay
                </p>
                <p className="text-3xl font-black tracking-tight text-foreground sm:text-4xl tabular-nums">
                  {formatInr(fixedAmount)}
                </p>
              </div>

              {/* Method Switch Tabs */}
              <div className="mt-3 flex justify-center">
                <div className="inline-flex rounded-xl bg-muted/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setActiveTab("UPI")}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] transition",
                      activeTab === "UPI"
                        ? "bg-card text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SvglUpi className="size-3" />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("CASH")}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] transition",
                      activeTab === "CASH"
                        ? "bg-card text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SvglCash className="size-3" />
                    <span>Cash</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Method Content */}
            <div className="p-4 sm:p-5">
              {activeTab === "UPI" ? (
                !upiConfigured ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-6 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                    <TriangleAlertIcon className="size-6 text-amber-600" />
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        Online UPI is not configured
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {profile.name} has not saved a merchant UPI ID yet. Pay
                        at the accounts counter instead, or contact the office.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("CASH")}
                      className="h-8 gap-1.5 text-[11px]"
                    >
                      <SvglCash className="size-3.5" />
                      Show cash pass
                    </Button>
                  </div>
                ) : (
                <div className="flex flex-col items-center space-y-3.5">
                  {/* Dynamic QR Box */}
                  <div className="relative flex size-[195px] items-center justify-center rounded-2xl border bg-white p-2 shadow-inner">
                    {generatingQr || !qrDataUrl ? (
                      <div className="flex size-full items-center justify-center">
                        <Loader2Icon className="size-6 animate-spin text-primary" />
                      </div>
                    ) : (
                      <img
                        src={qrDataUrl}
                        alt={`Scan UPI QR to pay ${formatInr(fixedAmount)}`}
                        className="size-full object-contain"
                      />
                    )}
                  </div>

                  {/* SVGL Brand Icons Strip */}
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <SvglGoogle className="size-3" /> GPay
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <SvglPhonePe className="size-3 rounded-full" /> PhonePe
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <SvglPaytmIcon className="size-3 rounded-xs" /> Paytm
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <SvglBhim className="size-3 rounded-xs" /> BHIM
                    </span>
                  </div>

                  {/* UPI ID + Copy */}
                  <div className="flex w-full items-center justify-between rounded-xl border bg-muted/30 px-3 py-1.5 text-xs">
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {upiId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                    >
                      {copiedUpi ? (
                        <span className="text-emerald-600 flex items-center gap-0.5">
                          <CheckIcon className="size-3" /> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5">
                          <CopyIcon className="size-3" /> Copy
                        </span>
                      )}
                    </button>
                  </div>

                  {/* One-Click Direct Pay Button */}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleOpenUpiApp()}
                    className="w-full h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 gap-1.5"
                  >
                    <SvglUpi className="size-4 shrink-0" />
                    <span>Pay {formatInr(fixedAmount)} via UPI</span>
                  </Button>

                  {/* Direct Launchers */}
                  <div className="grid grid-cols-3 gap-1.5 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenUpiApp("gpay")}
                      className="h-8 text-[11px] font-semibold gap-1.5 border-muted bg-card hover:bg-muted/40 shadow-2xs"
                    >
                      <SvglGoogle className="size-3.5" />
                      <span>GPay</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenUpiApp("phonepe")}
                      className="h-8 text-[11px] font-semibold gap-1.5 border-muted bg-card hover:bg-muted/40 shadow-2xs"
                    >
                      <SvglPhonePe className="size-3.5 rounded-full" />
                      <span>PhonePe</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenUpiApp("paytm")}
                      className="h-8 text-[11px] font-semibold gap-1.5 border-muted bg-card hover:bg-muted/40 shadow-2xs"
                    >
                      <SvglPaytmIcon className="size-3.5 rounded-xs" />
                      <span>Paytm</span>
                    </Button>
                  </div>
                </div>
                )
              ) : (
                /* Cash Counter Tab */
                <div className="flex flex-col items-center py-2 text-center space-y-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <SvglCash className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      Pay Cash at Counter Desk
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                      Generate a cash pass to deposit {formatInr(fixedAmount)} at {profile.name} accounts desk.
                    </p>
                  </div>
                  {cashError && (
                    <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                      {cashError}
                    </p>
                  )}
                  {!activeStudent && (
                    <p className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                      Select a student above to generate a cash pass.
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleGenerateCashPass}
                    disabled={submitting || !activeStudent}
                    className="w-full h-9 text-xs font-semibold gap-1.5"
                  >
                    {submitting ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <CheckIcon className="size-3.5" />
                    )}
                    <span>Generate Cash Pass</span>
                  </Button>
                </div>
              )}
            </div>

            {/* 4. Compact Footer */}
            <div className="border-t bg-muted/10 px-4 py-2.5 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1.5 font-medium">
              <ShieldCheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
              <span>256-bit Encrypted Official UPI Gateway</span>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
