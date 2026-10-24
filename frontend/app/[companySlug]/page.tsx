"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  getPublicPaymentStatus,
  getPublicProfile,
  createPublicPayment,
  type PaymentOrder,
  type PublicOrganizationProfile,
} from "@/lib/payments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  ArrowLeftIcon,
  Building2Icon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  HelpCircleIcon,
  Loader2Icon,
  PrinterIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react"

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000]

function formatInr(value: number | string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return `₹ ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
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

const selectClassName =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

export default function PublicPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const slug = String(params?.companySlug ?? "").trim()

  const [profile, setProfile] = useState<PublicOrganizationProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Form states
  const [selectedStudentId, setSelectedStudentId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [studentId, setStudentId] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("Tuition Fee")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  // Checkout states
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [polling, setPolling] = useState(false)

  // Load organization profile on mount
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

  // Poll order status when an active order exists
  useEffect(() => {
    if (!order || order.status === "SUCCESS" || order.status === "FAILED") return
    let isCancelled = false
    setPolling(true)

    const interval = setInterval(async () => {
      try {
        const latest = await getPublicPaymentStatus(order.orderId)
        if (isCancelled) return
        setOrder((prev) => ({ ...prev, ...latest }))

        if (latest.status === "SUCCESS" || latest.status === "FAILED") {
          clearInterval(interval)
          setPolling(false)
        }
      } catch {
        // Continue polling
      }
    }, 2500)

    return () => {
      isCancelled = true
      clearInterval(interval)
      setPolling(false)
    }
  }, [order?.orderId, order?.status])

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      setFormError("Please enter a valid payment amount greater than ₹0")
      return
    }

    if (!studentName.trim()) {
      setFormError("Please enter the student's full name")
      return
    }

    setSubmitting(true)
    try {
      const created = await createPublicPayment({
        slug,
        studentName: studentName.trim(),
        studentId: studentId.trim() || undefined,
        amount: numAmount,
        description: description.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      })
      setOrder(created)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not initiate payment session"
      )
    } finally {
      setSubmitting(false)
    }
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // ignore
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
            Loading institution payment portal…
          </p>
          <p className="text-xs text-muted-foreground">
            Connecting to secure gateway
          </p>
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
              <RefreshCwIcon className="size-4" />
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

  const checkoutUrl = order?.paymentUrl || order?.checkoutUrl

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/70 px-4 py-8 text-foreground sm:py-12 dark:from-zinc-950 dark:to-zinc-900">
      <div className="mx-auto max-w-2xl">
        {/* Header Institution Card */}
        <header className="mb-6 overflow-hidden rounded-3xl border bg-card p-6 shadow-sm shadow-black/[0.04] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-md shadow-primary/20">
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
                  <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {profile.name}
                  </h1>
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                    title="Verified Educational Organization"
                  >
                    <CheckCircle2Icon className="size-3" />
                    Verified
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  Official Online Fee Payment Portal
                  {profile.ownerName ? ` · ${profile.ownerName}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldCheckIcon className="size-3.5 text-primary" />
                SSL 256-bit Secure
              </span>
            </div>
          </div>

          {profile.description ? (
            <p className="mt-4 border-t pt-4 text-xs text-muted-foreground sm:text-sm">
              {profile.description}
            </p>
          ) : null}
        </header>

        {/* Step 3: SUCCESS STATE */}
        {order && order.status === "SUCCESS" ? (
          <section
            aria-label="Payment Receipt"
            className="rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.04] sm:p-8"
          >
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                <CheckIcon className="size-8 stroke-[2.5]" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-foreground">
                Payment Successful!
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your fee has been received and verified by {profile.name}.
              </p>
              <div className="mt-4 inline-block rounded-2xl bg-emerald-50 px-6 py-3 text-2xl font-bold tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                {formatInr(order.amount)}
              </div>
            </div>

            <div className="mt-8 divide-y rounded-2xl border bg-muted/20 text-xs sm:text-sm">
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Student Name</span>
                <span className="font-semibold text-foreground">
                  {order.studentName}
                </span>
              </div>
              {order.studentId ? (
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-muted-foreground">Student ID / Roll</span>
                  <span className="font-mono text-foreground">
                    {order.studentId}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Transaction / Order ID</span>
                <span className="font-mono text-foreground">{order.orderId}</span>
              </div>
              {order.utr ? (
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-muted-foreground">Bank UTR / Ref</span>
                  <span className="font-mono font-medium text-foreground">
                    {order.utr}
                  </span>
                </div>
              ) : null}
              {order.receiptId ? (
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-muted-foreground">Official Receipt No</span>
                  <span className="font-mono font-semibold text-primary">
                    {order.receiptId}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">Payment Date</span>
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
                  setAmount("")
                }}
              >
                Pay Another Fee
              </Button>
            </div>
          </section>
        ) : order && checkoutUrl ? (
          /* Step 2: GATEWAY ACTIVE CHECKOUT */
          <section
            aria-label="Gateway Checkout"
            className="rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.04] sm:p-8"
          >
            <div className="mb-4 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOrder(null)}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeftIcon className="size-3.5" />
                Change Details
              </Button>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Awaiting UPI Payment
                </span>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Paying for</p>
                  <p className="font-semibold text-foreground">
                    {order.studentName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatInr(order.amount)}
                  </p>
                </div>
              </div>
            </div>

            {/* Embedded YOUPI Gateway Iframe */}
            <div className="overflow-hidden rounded-2xl border bg-white shadow-inner">
              <iframe
                src={checkoutUrl}
                title="YOUPI PG Payment Gateway"
                className="h-[520px] w-full border-0 sm:h-[560px]"
                allow="clipboard-write"
              />
            </div>

            {/* Direct Open / Copy Links */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void copyUrl(checkoutUrl)}
                  className="gap-1"
                >
                  {copiedLink ? (
                    <CheckIcon className="size-3 text-emerald-600" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                  <span>{copiedLink ? "Link Copied" : "Copy Payment Link"}</span>
                </Button>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                  <span>Open in UPI App</span>
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
              <span className="text-[11px]">
                Order ID: <code className="font-mono">{order.orderId}</code>
              </span>
            </div>
          </section>
        ) : (
          /* Step 1: FEE PAYMENT FORM */
          <section
            aria-label="Fee Details Form"
            className="rounded-3xl border bg-card p-6 shadow-md shadow-black/[0.04] sm:p-8"
          >
            <div className="mb-6 flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Fee Payment Details
                </h2>
                <p className="text-xs text-muted-foreground">
                  Enter student details to proceed to secure UPI checkout.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <QrCodeIcon className="size-4 text-primary" />
                <span>UPI Enabled</span>
              </div>
            </div>

            {formError && (
              <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Student Dropdown Selector */}
              {profile?.students && profile.students.length > 0 ? (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="pub-student-select">
                      Select Student <span className="text-destructive">*</span>
                    </FieldLabel>
                    <span className="text-xs text-muted-foreground">
                      {profile.students.length} student{profile.students.length === 1 ? "" : "s"} enrolled
                    </span>
                  </div>
                  <div className="space-y-3">
                    <select
                      id="pub-student-select"
                      className={selectClassName}
                      value={selectedStudentId}
                      onChange={(e) => {
                        const val = e.target.value
                        setSelectedStudentId(val)
                        if (val === "__custom__") {
                          setStudentName("")
                          setStudentId("")
                          return
                        }
                        const matched = (profile.students ?? []).find((s) => s.studentId === val)
                        if (matched) {
                          setStudentName(matched.studentName)
                          setStudentId(matched.studentId)
                          if (matched.phone) setPhone(matched.phone)
                          if (matched.email) setEmail(matched.email)
                        }
                      }}
                      required={!studentName}
                    >
                      <option value="">-- Select student from dropdown --</option>
                      {profile.students.map((s) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.studentName} ({s.studentId}){s.group ? ` · ${s.group}` : ""}{s.course ? ` · ${s.course}` : ""}
                        </option>
                      ))}
                      <option value="__custom__">+ Other student / Enter manually</option>
                    </select>

                    {/* Selected Student Details Card */}
                    {selectedStudentId && selectedStudentId !== "__custom__" ? (
                      (() => {
                        const s = (profile.students ?? []).find((x) => x.studentId === selectedStudentId)
                        if (!s) return null
                        return (
                          <div className="rounded-2xl border bg-primary/5 p-4 text-xs text-foreground space-y-2 shadow-sm border-primary/20">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-primary flex items-center gap-1.5">
                                <GraduationCapIcon className="size-4" />
                                {s.studentName}
                              </span>
                              <span className="font-mono text-[11px] rounded bg-muted px-2 py-0.5 font-medium">
                                {s.studentId}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              {s.group ? <span><strong>Class / Group:</strong> {s.group}</span> : null}
                              {s.course ? <span><strong>Course:</strong> {s.course}</span> : null}
                              {s.phone ? <span><strong>Phone:</strong> {s.phone}</span> : null}
                              {s.email ? <span><strong>Email:</strong> {s.email}</span> : null}
                            </div>
                          </div>
                        )
                      })()
                    ) : null}
                  </div>
                </Field>
              ) : null}

              {/* Show Manual inputs if "__custom__" is chosen OR no enrolled students yet */}
              {(!profile?.students?.length || selectedStudentId === "__custom__" || !selectedStudentId) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="pub-student-name">
                      Student Full Name <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="pub-student-name"
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="pub-student-id">
                      Student ID / Roll No{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (Optional)
                      </span>
                    </FieldLabel>
                    <Input
                      id="pub-student-id"
                      type="text"
                      placeholder="e.g. STU-001"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </Field>
                </div>
              )}

              {/* Amount field with chips */}
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="pub-amount">
                    Fee Amount (₹) <span className="text-destructive">*</span>
                  </FieldLabel>
                  {amount && Number(amount) > 0 ? (
                    <span className="font-semibold text-primary text-sm">
                      {formatInr(amount)}
                    </span>
                  ) : null}
                </div>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="pub-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-11 pl-8 text-base font-medium"
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground self-center mr-1">
                    Quick amounts:
                  </span>
                  {PRESET_AMOUNTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(String(p))}
                      className="rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:bg-primary/5 active:scale-95"
                    >
                      ₹{p.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Fee description / purpose */}
              <Field>
                <FieldLabel htmlFor="pub-description">
                  Fee Purpose / Remarks
                </FieldLabel>
                <Input
                  id="pub-description"
                  type="text"
                  placeholder="e.g. Term 1 Tuition Fee, Transport, Library"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-10 text-sm"
                />
              </Field>

              {/* Contact info for receipt */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="pub-phone">
                    Mobile Number{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (for SMS / WhatsApp receipt)
                    </span>
                  </FieldLabel>
                  <Input
                    id="pub-phone"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-10 text-sm"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="pub-email">
                    Email Address{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (for digital invoice)
                    </span>
                  </FieldLabel>
                  <Input
                    id="pub-email"
                    type="email"
                    placeholder="student@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 text-sm"
                  />
                </Field>
              </div>

              {/* Payment Method Banner */}
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <QrCodeIcon className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        UPI Fast Checkout
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Google Pay, PhonePe, Paytm, BHIM, and all UPI apps
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Instant
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
              >
                {submitting ? (
                  <>
                    <Loader2Icon className="size-5 animate-spin mr-2" />
                    Initializing Payment Gateway…
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="size-5 mr-2" />
                    Proceed to Pay {amount ? formatInr(amount) : "Fee"}
                  </>
                )}
              </Button>
            </form>
          </section>
        )}

        {/* Footer Guarantee */}
        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Secure 256-bit encrypted transaction · YOUPI Payment Gateway</span>
          </p>
          <p className="mt-1">
            Questions? Contact {profile.name} at{" "}
            {profile.phone || profile.email || "the administrative office"}.
          </p>
        </footer>
      </div>
    </main>
  )
}
