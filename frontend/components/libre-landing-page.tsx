"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ShieldCheck,
  Zap,
  QrCode,
  MessageSquare,
  Receipt,
  CreditCard,
  TrendingUp,
  Users,
  Building2,
  Sparkles,
  Smartphone,
  Lock,
  ChevronDown,
  ChevronRight,
  Star,
  BadgePercent,
  Clock,
  Wallet,
  ArrowUpRight,
  School,
  BookOpen,
  DollarSign,
  Send,
  BarChart3,
  FileCheck2,
} from "lucide-react"

interface LibreLandingPageProps {
  isAuthenticated?: boolean
}

export function LibreLandingPage({ isAuthenticated = false }: LibreLandingPageProps) {
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">("annual")
  const [openFaq, setOpenFaq] = React.useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-foreground selection:text-background">
      {/* Background radial highlight & subtle grid */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] opacity-40 blur-[120px] dark:opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(120, 119, 198, 0.25) 0%, rgba(255, 255, 255, 0) 70%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Floating Modern Header / Navbar (Tailark Libre Style) */}
      <header className="sticky top-4 z-50 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between rounded-full border border-border/80 bg-background/80 px-4 sm:px-6 shadow-sm backdrop-blur-md transition-all">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex size-8 items-center justify-center rounded-lg bg-foreground/5 p-1 ring-1 ring-border transition-transform group-hover:scale-105">
              <img src="/logo.png" alt="MyFees Logo" className="size-6 object-contain" />
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-sm tracking-tight">MyFees</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">
                v2.0
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-muted-foreground">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it Works
            </a>
            <a href="#preview" className="transition-colors hover:text-foreground">
              Live Showcase
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-medium text-background transition-transform hover:opacity-90 active:scale-95"
              >
                Dashboard
                <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-medium text-background transition-transform hover:opacity-90 active:scale-95 shadow-xs"
                >
                  Get Started
                  <ArrowRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          {/* Shimmer Announcement Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/60 px-3.5 py-1 text-xs font-medium text-foreground backdrop-blur-xs shadow-xs mb-8 transition-transform hover:scale-[1.02]">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-muted-foreground">Tailark Libre Edition:</span>
            <span>Zero Gateway Fees & Direct Bank UPI</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </div>

          {/* Main Headline */}
          <h1 className="mx-auto max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-balance leading-[1.12]">
            Collect school & institute fees <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              without losing 2–3% per transaction.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">
            All-in-one fees operating system for schools, coaching institutes, and colleges.
            Collect payments directly to your bank account via UPI, send automated WhatsApp reminders,
            and generate instant digital receipts.
          </p>

          {/* Call to action buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={isAuthenticated ? "/dashboard" : "/signup"}
              className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-95 shadow-sm"
            >
              <span>{isAuthenticated ? "Open Institute Dashboard" : "Start Free Workspace"}</span>
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#preview"
              className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
            >
              <span>Explore Live Showcase</span>
            </a>
          </div>

          {/* Micro trust indicators */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              100% Direct Bank Settlement
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Automated WhatsApp Reminders
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Zero Setup Fees
            </span>
          </div>

          {/* Hero Mock App Window (Libre Product Showcase) */}
          <div id="preview" className="mt-14 sm:mt-18 scroll-mt-28">
            <div className="relative mx-auto max-w-5xl rounded-2xl border border-border/80 bg-card/60 p-2 shadow-2xl backdrop-blur-xl ring-1 ring-border/50">
              {/* Window Header */}
              <div className="flex h-9 items-center justify-between border-b border-border/60 bg-muted/40 px-4 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-rose-500/80" />
                  <span className="size-2.5 rounded-full bg-amber-500/80" />
                  <span className="size-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                  <Lock className="size-3 text-emerald-500" />
                  <span>https://myfees.myenum.in/dashboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-muted-foreground font-mono">LIVE SYNC</span>
                </div>
              </div>

              {/* Inside Window: Mock Dashboard Showcase */}
              <div className="grid gap-4 p-4 text-left sm:p-6 lg:grid-cols-12 bg-background/50 rounded-b-xl">
                {/* Left Column: Metrics & Collections Overview (4 cols) */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  <div className="rounded-xl border border-border/70 bg-card p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Total Collections This Month</span>
                      <span className="inline-flex items-center text-emerald-600 font-medium">
                        <TrendingUp className="mr-1 size-3" /> +28.4%
                      </span>
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                      ₹14,85,200
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Across 520 students in 8 active batches
                    </p>

                    <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground text-[11px]">Settled directly</span>
                        <div className="font-semibold text-emerald-600">₹14,85,200</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[11px]">Gateway Fee Paid</span>
                        <div className="font-semibold text-foreground">₹0 (0%)</div>
                      </div>
                    </div>
                  </div>

                  {/* Batch collection breakdown */}
                  <div className="rounded-xl border border-border/70 bg-card p-4">
                    <div className="text-xs font-semibold text-foreground">Collection Status</div>
                    <div className="mt-3 space-y-2.5 text-xs">
                      <div>
                        <div className="flex justify-between text-muted-foreground text-[11px] mb-1">
                          <span>Class 10 CBSE (Batches A & B)</span>
                          <span className="font-medium text-foreground">96%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "96%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-muted-foreground text-[11px] mb-1">
                          <span>IIT-JEE Crash Course 2026</span>
                          <span className="font-medium text-foreground">92%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "92%" }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-muted-foreground text-[11px] mb-1">
                          <span>Foundation Batch 2026-27</span>
                          <span className="font-medium text-foreground">84%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: "84%" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Payment Feed & WhatsApp Reminders (8 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                  {/* Live Transactions Strip */}
                  <div className="rounded-xl border border-border/70 bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="size-4 text-emerald-500" />
                        <span className="text-xs font-semibold">Real-Time UPI Transactions</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">INSTANT RECEIPT EMITTED</span>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-xs">
                            AS
                          </div>
                          <div>
                            <div className="font-medium text-foreground">Aarav Sharma</div>
                            <div className="text-[11px] text-muted-foreground">Class 10 CBSE • Term 2 Tuition</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">₹8,500</div>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-600 font-medium">
                            <CheckCircle2 className="size-3" /> Settled via GPay
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs">
                            PM
                          </div>
                          <div>
                            <div className="font-medium text-foreground">Priya Menon</div>
                            <div className="text-[11px] text-muted-foreground">NEET Medical Batch • Installment #3</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">₹12,000</div>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-600 font-medium">
                            <CheckCircle2 className="size-3" /> Settled via PhonePe
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-xs">
                            RK
                          </div>
                          <div>
                            <div className="font-medium text-foreground">Rohan Kulkarni</div>
                            <div className="text-[11px] text-muted-foreground">Annual Sports & Library Fee</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">₹3,200</div>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-600 font-medium">
                            <CheckCircle2 className="size-3" /> Settled via Paytm UPI
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Simulated WhatsApp Reminder Bubble */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 dark:bg-emerald-950/20 p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="size-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-semibold text-foreground">
                          Automated WhatsApp Reminder Delivery
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Official Baileys & Cloud Bot
                      </span>
                    </div>

                    <div className="mt-3 flex gap-3 text-xs">
                      <div className="size-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                        MF
                      </div>
                      <div className="flex-1 bg-card rounded-xl p-3 border border-border shadow-xs text-foreground">
                        <p className="font-medium text-xs">
                          Dear Parent, Term 2 fees for <span className="underline decoration-border">Aarav Sharma</span> (Roll #104) is due.
                        </p>
                        <div className="mt-2 text-[11px] text-muted-foreground space-y-1">
                          <div>• Amount Due: <span className="font-semibold text-foreground">₹8,500</span></div>
                          <div>• Due Date: <span className="font-semibold text-foreground">15th of this month</span></div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-medium">
                            <Smartphone className="size-3" /> Tap to Pay via UPI
                          </span>
                          <span className="text-[10px] text-muted-foreground">Receipt automatically sent upon payment ✓✓</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Stats Strip */}
      <section className="border-y border-border/80 bg-muted/30 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-4">
            <div>
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">0%</div>
              <p className="mt-1 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                Gateway Commission
              </p>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">₹10Cr+</div>
              <p className="mt-1 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                Fees Collected Calmly
              </p>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">99.2%</div>
              <p className="mt-1 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                On-Time Collection
              </p>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">&lt; 3 Sec</div>
              <p className="mt-1 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                Instant UPI Settlement
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid (Tailark Libre Bento Style) */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Architecture & Capabilities
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl text-foreground">
              Engineered for seamless fee operations.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Say goodbye to manual bank statement cross-checking, lost physical receipts, and awkward reminder phone calls.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Bento 1: Direct Bank Settlement */}
            <div className="group relative rounded-2xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-md">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border">
                <QrCode className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Direct Bank UPI Settle</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Parents scan dynamic QR codes or click UPI links. Payments credit directly to your institute's bank account with 0% gateway cuts.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Learn more <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>

            {/* Bento 2: Automated WhatsApp Broadcasts */}
            <div className="group relative rounded-2xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-md">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border">
                <MessageSquare className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Automated WhatsApp Followups</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Connect your WhatsApp session once. Send fee due alerts, payment links, and holiday announcements with 98% open rates.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Learn more <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>

            {/* Bento 3: Digital Receipts & Audit */}
            <div className="group relative rounded-2xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-md">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border">
                <Receipt className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Instant PDF Receipts</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Generate branded receipts with sequential serial numbers, breakdown of fees, and GST tax computation sent straight to parents.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Learn more <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>

            {/* Bento 4: Flexible Fee Structures */}
            <div className="group relative rounded-2xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-md">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border">
                <BarChart3 className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Custom Fee Structures</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Support tuition, lab, exam, hostel, and bus transport fees. Configure installment schedules, early discounts, and late fine rules.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Learn more <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>

            {/* Bento 5: Multi-Staff & Role Access */}
            <div className="group relative rounded-2xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-md">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border">
                <Users className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Role-Based Team Access</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Create separate profiles for your accountant, front-desk staff, and branch managers with granular permissions.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Learn more <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>

            {/* Bento 6: Private Workspace & Public Link */}
            <div className="group relative rounded-2xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-md">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Private Workspace & Portal</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Every signup receives an isolated Appwrite workspace and a dedicated public fee portal at <span className="font-mono text-xs">myfees.myenum.in/[slug]</span>.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Learn more <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="border-t border-border/80 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Effortless Setup
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl text-foreground">
              Up and running in 3 simple steps.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              No complex merchant banking documentation or weeks of waiting.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border/60">
                  Step 01
                </span>
                <School className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Add Batches & Students</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Import your existing student roster via Excel or add them manually with their respective fee structures and phone numbers.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border/60">
                  Step 02
                </span>
                <Send className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Share Links & Reminders</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Send fee payment links via 1-click WhatsApp broadcasts or let parents scan the dynamic counter UPI QR.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border/60">
                  Step 03
                </span>
                <FileCheck2 className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Auto-Reconcile & Receipts</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Money settles instantly in your bank account, the student ledger updates automatically, and parents receive an instant PDF receipt.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison: Traditional vs MyFees */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Cost Transparency
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-foreground">
              Why institutes switch to MyFees.
            </h2>
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            <div className="grid grid-cols-3 border-b border-border bg-muted/50 p-4 text-xs font-semibold">
              <div className="text-muted-foreground">Key Feature</div>
              <div className="text-muted-foreground">Traditional Gateways / Manual</div>
              <div className="text-foreground">MyFees</div>
            </div>

            <div className="divide-y divide-border/60 text-xs sm:text-sm">
              <div className="grid grid-cols-3 p-4 items-center">
                <div className="font-medium text-foreground">Transaction Cut</div>
                <div className="text-destructive font-medium">2% to 3% + GST</div>
                <div className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="size-4" /> 0% (Direct UPI)
                </div>
              </div>

              <div className="grid grid-cols-3 p-4 items-center">
                <div className="font-medium text-foreground">Bank Settlement Time</div>
                <div className="text-muted-foreground">T+2 or T+3 Business Days</div>
                <div className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="size-4" /> Instant (Zero wait)
                </div>
              </div>

              <div className="grid grid-cols-3 p-4 items-center">
                <div className="font-medium text-foreground">Fee Due Reminders</div>
                <div className="text-muted-foreground">Manual calls & physical letters</div>
                <div className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="size-4" /> Automated WhatsApp alerts
                </div>
              </div>

              <div className="grid grid-cols-3 p-4 items-center">
                <div className="font-medium text-foreground">Receipt Generation</div>
                <div className="text-muted-foreground">Paper receipt books or spreadsheets</div>
                <div className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="size-4" /> Instant branded digital PDFs
                </div>
              </div>

              <div className="grid grid-cols-3 p-4 items-center">
                <div className="font-medium text-foreground">Parent App Dependency</div>
                <div className="text-muted-foreground">Forced app install or complex portals</div>
                <div className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="size-4" /> No app required (UPI apps)
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-border/80 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Simple & Fair
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl text-foreground">
              Predictable pricing for every institution.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Never pay per-transaction fees. Keep 100% of the tuition you earn.
            </p>

            {/* Billing Toggle */}
            <div className="mt-6 inline-flex items-center rounded-full border border-border bg-card p-1 text-xs">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  billingCycle === "monthly" ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                Monthly billing
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`rounded-full px-3 py-1 font-medium transition-colors flex items-center gap-1.5 ${
                  billingCycle === "annual" ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                <span>Annual billing</span>
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {/* Starter Tier */}
            <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="text-sm font-semibold text-foreground">Starter</div>
              <p className="mt-1 text-xs text-muted-foreground">For private tutors and independent coaching.</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">₹0</span>
                <span className="text-xs text-muted-foreground">/ free forever</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-xs text-muted-foreground flex-1">
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Up to 50 active students
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Direct UPI payment links & QR
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Unlimited digital PDF receipts
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Excel export & basic ledger
                </li>
              </ul>
              <Link
                href="/signup"
                className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Get Started
              </Link>
            </div>

            {/* Growth Tier (Featured) */}
            <div className="relative flex flex-col rounded-2xl border-2 border-foreground bg-card p-6 shadow-md">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
                Most Popular
              </div>
              <div className="text-sm font-semibold text-foreground">Institute Growth</div>
              <p className="mt-1 text-xs text-muted-foreground">For coaching academies, dance & sports schools.</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  {billingCycle === "annual" ? "₹1,499" : "₹1,899"}
                </span>
                <span className="text-xs text-muted-foreground">/ month</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-xs text-muted-foreground flex-1">
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Unlimited students & batches
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Automated WhatsApp reminders (Baileys/Cloud)
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Custom branding & institute logo on receipts
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> 0% per-transaction commission
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Up to 5 staff accounts with roles
                </li>
              </ul>
              <Link
                href="/signup"
                className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-lg bg-foreground text-xs font-medium text-background transition-all hover:opacity-90 shadow-xs"
              >
                Start 14-Day Free Trial
              </Link>
            </div>

            {/* Enterprise Tier */}
            <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="text-sm font-semibold text-foreground">Campus / Multi-Branch</div>
              <p className="mt-1 text-xs text-muted-foreground">For K-12 schools, degree colleges, and large networks.</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  {billingCycle === "annual" ? "₹4,999" : "₹5,999"}
                </span>
                <span className="text-xs text-muted-foreground">/ month</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-xs text-muted-foreground flex-1">
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Multi-branch centralized dashboard
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Custom domain portal (e.g. fees.yourschool.edu)
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> ERP & Tally export integration
                </li>
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-emerald-500" /> Dedicated account manager & onboarding
                </li>
              </ul>
              <Link
                href="/signup"
                className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Common Questions
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-foreground">
              Frequently asked questions.
            </h2>
          </div>

          <div className="mt-10 space-y-3">
            {[
              {
                q: "Are there any deductions or percentage fees on collected payments?",
                a: "No! Unlike standard payment gateways that take 2% to 3% plus GST on every transaction, MyFees routes payments directly to your registered bank account via standard UPI rails. You receive 100% of the tuition fees.",
              },
              {
                q: "Do parents or students need to download an application to pay?",
                a: "Never. Parents simply open the payment link on their phone or scan the QR code. It opens directly in their preferred UPI app (Google Pay, PhonePe, Paytm, BHIM, or any banking app).",
              },
              {
                q: "How do automated WhatsApp reminders work?",
                a: "You can pair your institute WhatsApp number once through our built-in QR pairing. MyFees sends automated polite fee due notifications with personalized payment links and instant confirmation receipts once paid.",
              },
              {
                q: "Can I customize the receipts with our school logo and tax information?",
                a: "Yes. In your settings dashboard, you can upload your school logo, specify GST or registration numbers, set custom receipt prefixes, and configure notes or terms.",
              },
              {
                q: "Can I import existing students and batches from an Excel sheet?",
                a: "Yes, MyFees provides one-click CSV and Excel import for student lists, batches, and historical dues so you can migrate in minutes.",
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/70 bg-card overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(i)}
                  className="flex w-full items-center justify-between p-4 text-left text-xs sm:text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-xs sm:text-sm text-muted-foreground border-t border-border/40 pt-3 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner (Tailark Libre Dark Gradient Card) */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-neutral-950 px-6 py-14 sm:px-12 sm:py-16 text-center text-white shadow-2xl">
            {/* Ambient glow in banner */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.4), transparent 60%)",
              }}
            />

            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-neutral-200 mb-6 backdrop-blur-xs">
              <Sparkles className="size-3.5 text-amber-400" />
              Start in under 3 minutes
            </span>

            <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight sm:text-4xl text-balance">
              Take complete control of your institute fees today.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-neutral-400 leading-relaxed">
              Create your dedicated fees workspace, connect your UPI ID, and experience zero commission collection.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={isAuthenticated ? "/dashboard" : "/signup"}
                className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-neutral-950 transition-all hover:bg-neutral-100 active:scale-95 shadow-md"
              >
                <span>{isAuthenticated ? "Launch Dashboard" : "Get Started for Free"}</span>
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex h-11 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 px-6 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                Sign In to Existing Account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-muted/30 py-10 text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-muted ring-1 ring-border">
              <img src="/logo.png" alt="MyFees" className="size-4 object-contain" />
            </span>
            <span className="font-semibold text-foreground">MyFees</span>
            <span>— Fees, collected calmly.</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Register
            </Link>
          </div>

          <div className="font-mono text-[11px]">
            © {new Date().getFullYear()} MyFees · All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
