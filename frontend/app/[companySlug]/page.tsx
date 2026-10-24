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
import { Button } from "@/components/ui/button"
import {
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  Loader2Icon,
  PrinterIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  UserCheckIcon,
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

  // Student identifier query (e.g. ?student=gunduss, ?student=STU-002, ?student=amarnath, ?user=gunduss)
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

  const upiId = profile?.upiId || "6374984055@upi"
  const payeeName = profile?.payeeName || profile?.name || "Amarnath"
  const numAmount = parseFloat(fixedAmount) || 5000
  const amountFormatted = numAmount.toFixed(2)

  // Construct UPI payment URI for that specific student and fixed fee
  const upiUri = useMemo(() => {
    const studentNote = activeStudent
      ? `Fee-${activeStudent.studentName.replace(/\s+/g, "")}-${activeStudent.studentId}`
      : `Fee-Payment`
    return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      payeeName
    )}&am=${encodeURIComponent(amountFormatted)}&cu=INR&tn=${encodeURIComponent(studentNote)}`
  }, [upiId, payeeName, amountFormatted, activeStudent])

  // Generate dynamic QR Code live for that specific student fee
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
      setTimeout(() => setCopiedUpi(false), 2200)
    } catch {
      // ignore
    }
  }

  // Open in UPI App
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

  // Cash pass generation
  const handleGenerateCashPass = async () => {
    setSubmitting(true)
    try {
      const passId = `PASS-${Date.now().toString().slice(-6)}`
      setCashPass({
        passId,
        studentName: activeStudent?.studentName || "Student",
        studentId: activeStudent?.studentId || "STU-001",
        amount: fixedAmount,
        timestamp: new Date().toISOString(),
      })
      await createPublicPayment({
        slug,
        studentName: activeStudent?.studentName || "Student",
        studentId: activeStudent?.studentId || "STU-001",
        amount: numAmount,
        method: "CASH_COUNTER",
      }).catch(() => null)
    } finally {
      setSubmitting(false)
    }
  }

  // Strict payment status verification: ONLY allow completed status if the server/gateway
  // explicitly verifies and confirms the order status as SUCCESS or COMPLETED.
  const queryOrderId = (searchParams?.get("orderId") || "").trim()

  useEffect(() => {
    if (!queryOrderId) return
    let active = true

    const verifyServerPayment = async () => {
      try {
        const orderData = await getPublicPaymentStatus(queryOrderId)
        if (!active) return
        // STRICT: Without verified payment status, do NOT allow completed status!
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
            Loading student fee portal…
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
        {/* Verified Institution Header */}
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
            STATE 1: PAYMENT SUCCESS / RECEIPT (STRICT: ONLY ON VERIFIED PAYMENT STATUS)
           ========================================================================= */}
        {order && (order.status === "SUCCESS" || order.status === "COMPLETED") ? (
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
                <SvglCash className="size-7" />
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
              MAIN USER PAYMENT SCREEN:
              1. Exact Student & Fixed Verified Fee Amount ("dont create own")
              2. Payment Methods Only
             ========================================================================= */
          <div className="space-y-6">
            {/* Student Switcher Bar (when multiple students enrolled) */}
            {profile?.students && profile.students.length > 1 && (
              <div className="rounded-2xl border bg-card/60 p-3 shadow-2xs">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Enrolled Students
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Select to view individual fee
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.students.map((s) => {
                    const isSelected = activeStudent?.studentId === s.studentId
                    return (
                      <button
                        key={s.studentId}
                        type="button"
                        onClick={() => handleSelectStudent(s)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition active:scale-95",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs font-semibold ring-2 ring-primary/20"
                            : "border bg-muted/30 text-foreground hover:bg-muted"
                        )}
                      >
                        <UserCheckIcon className="size-3.5" />
                        <span>{s.studentName}</span>
                        <span className="opacity-75">({s.studentId})</span>
                        <span className="ml-1 rounded-md bg-black/10 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">
                          {formatInr(s.feeAmount || "5000")}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                CARD 1: HOW MUCH TO PAY (EXACT USER FEE VALUE ONLY)
               ------------------------------------------------------------- */}
            <section className="overflow-hidden rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.03] sm:p-7">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fee Amount to Pay
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Verified Due
                </span>
              </div>

              {/* Exact Fee Display (Fixed, no arbitrary editing / cannot create own) */}
              <div className="mt-4 flex flex-col items-center justify-center py-2 text-center">
                <span className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl tabular-nums">
                  {formatInr(fixedAmount)}
                </span>

                {/* Specific Student Info Card */}
                {activeStudent && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3.5 py-1 text-xs text-foreground">
                    <GraduationCapIcon className="size-3.5 text-primary" />
                    <span className="font-semibold">{activeStudent.studentName}</span>
                    <span className="text-muted-foreground">({activeStudent.studentId})</span>
                    {activeStudent.group && (
                      <span className="border-l pl-2 text-muted-foreground">
                        {activeStudent.group}
                      </span>
                    )}
                  </div>
                )}

                <p className="mt-2 text-xs text-muted-foreground">
                  Official monthly fee for {activeStudent?.studentName || "student"} · {profile.name}
                </p>
              </div>
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
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
                      activeTab === "UPI"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SvglUpi className="size-3.5 shrink-0" />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("CASH")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
                      activeTab === "CASH"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <SvglCash className="size-3.5 shrink-0" />
                    <span>Cash Counter</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: UPI & DYNAMIC QR */}
              {activeTab === "UPI" && (
                <div className="mt-6 space-y-6">
                  {/* Dynamic QR Code Card (Generated specifically for this user & fee) */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border bg-slate-50/80 dark:bg-zinc-900/60 p-6 shadow-inner text-center">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <SvglUpi className="size-3.5 shrink-0" />
                      <span>Scan to Pay with Any UPI App</span>
                    </div>

                    <div className="mt-3 relative flex items-center justify-center rounded-2xl border bg-white p-3 shadow-md">
                      {generatingQr || !qrDataUrl ? (
                        <div className="flex size-64 items-center justify-center">
                          <Loader2Icon className="size-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <img
                          src={qrDataUrl}
                          alt={`Scan UPI QR to pay ${formatInr(fixedAmount)} for ${activeStudent?.studentName || "student"}`}
                          className="size-60 sm:size-64 object-contain"
                        />
                      )}
                    </div>

                    {/* Supported Apps Logo Bar */}
                    <div className="mt-3 flex items-center justify-center gap-4 py-1 text-muted-foreground">
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <SvglGoogle className="size-3.5" /> GPay
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <SvglPhonePe className="size-3.5 rounded-full" /> PhonePe
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <SvglPaytm className="h-3 w-auto" />
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <SvglBhim className="size-3.5 rounded-xs" /> BHIM
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-center gap-2">
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
                      Paying {formatInr(fixedAmount)} for {activeStudent?.studentName} ({activeStudent?.studentId})
                    </p>
                  </div>

                  {/* One-Click Direct Pay Button */}
                  <div className="space-y-3">
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => handleOpenUpiApp()}
                      className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 gap-2.5"
                    >
                      <SvglUpi className="size-5 shrink-0" />
                      <span>Pay {formatInr(fixedAmount)} via UPI</span>
                    </Button>

                    {/* Quick Direct UPI App Launchers with SVGL icons */}
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenUpiApp("tez://upi/pay?")}
                        className="h-11 text-xs font-semibold border-muted/80 hover:border-foreground/30 bg-card shadow-2xs gap-2 hover:bg-muted/30"
                      >
                        <SvglGoogle className="size-4 shrink-0" />
                        <span className="font-semibold text-foreground">GPay</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenUpiApp("phonepe://pay?")}
                        className="h-11 text-xs font-semibold border-muted/80 hover:border-foreground/30 bg-card shadow-2xs gap-2 hover:bg-muted/30"
                      >
                        <SvglPhonePe className="size-4 shrink-0" />
                        <span className="font-semibold text-foreground">PhonePe</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenUpiApp("paytmmp://pay?")}
                        className="h-11 text-xs font-semibold border-muted/80 hover:border-foreground/30 bg-card shadow-2xs gap-2 hover:bg-muted/30"
                      >
                        <SvglPaytmIcon className="size-4 shrink-0 rounded-xs" />
                        <span className="font-semibold text-foreground">Paytm</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CASH AT COUNTER */}
              {activeTab === "CASH" && (
                <div className="mt-6 space-y-5 text-center">
                  <div className="rounded-2xl border bg-muted/20 p-5">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                      <SvglCash className="size-6" />
                    </div>
                    <h3 className="font-semibold text-sm text-foreground">
                      Pay Cash at Counter Desk
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                      Generate a digital cash payment pass to deposit {formatInr(fixedAmount)} for {activeStudent?.studentName} directly at the accounts counter desk.
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

        {/* Footer */}
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
