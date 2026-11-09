"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Search,
  Bell,
  SlidersHorizontal,
  LayoutGrid,
  Circle,
  Clock,
  Sparkles,
  ExternalLink,
  Code2,
  CreditCard,
  Building2,
  Lock,
} from "lucide-react"

interface LibreLandingPageProps {
  isAuthenticated?: boolean
}

export function LibreLandingPage({ isAuthenticated = false }: LibreLandingPageProps) {
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annually">("annually")
  const [activeFilter, setActiveFilter] = React.useState<string>("Status")

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0D0D11] text-foreground font-sans antialiased selection:bg-[#635BFF] selection:text-white">
      {/* Top Navbar — Tailark Libre Style */}
      <header className="w-full border-b border-border/40 bg-white/80 dark:bg-[#0D0D11]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="font-bold text-xl tracking-tight text-foreground font-mono lowercase">
                stripe
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground border border-border/50">
                libre
              </span>
            </Link>

            {/* Nav Menu */}
            <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
              <button className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <span>Product</span>
                <ChevronDown className="size-3.5 opacity-70" />
              </button>
              <button className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <span>Solutions</span>
                <ChevronDown className="size-3.5 opacity-70" />
              </button>
              <a href="#pricing" className="hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#integrations" className="hover:text-foreground transition-colors">
                Company
              </a>
            </nav>
          </div>

          {/* Right Action Button */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-all hover:opacity-90 active:scale-95"
              >
                Dashboard
                <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-white dark:bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 shadow-2xs"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <section className="pt-20 pb-16 sm:pt-28 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-bold tracking-tight text-foreground leading-[1.08] text-balance">
            The Financial OS powering <br />
            businesses on your platform
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
            Experience seamless payments, real-time collaboration, and actionable insights. Set up in minutes.
          </p>

          {/* Violet CTA Button */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href={isAuthenticated ? "/dashboard" : "/signup"}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[#635BFF] hover:bg-[#5851EA] px-6 text-sm font-medium text-white transition-all shadow-sm active:scale-95"
            >
              Get Started
            </Link>
          </div>
        </div>

        {/* The Signature Libre Technical Blueprint & Payment Card Graphic */}
        <div className="max-w-6xl mx-auto mt-16 relative">
          <div className="relative rounded-3xl bg-[#F6F8FA] dark:bg-[#141419] border border-border/70 p-6 sm:p-14 overflow-hidden shadow-xs">
            {/* Blueprint Grid Lines & Decorative Dot Patterns */}
            <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20">
              <div
                className="w-full h-full"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
            </div>

            {/* Left Decorative Blueprint Column */}
            <div className="hidden lg:flex flex-col items-center justify-between absolute left-8 top-12 bottom-12 pointer-events-none select-none">
              {/* Dot Matrix 4x4 */}
              <div className="grid grid-cols-4 gap-1.5 opacity-30">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="size-1 rounded-full bg-foreground" />
                ))}
              </div>

              {/* Vertical Monospace Badge */}
              <div className="py-8 my-auto [writing-mode:vertical-lr] rotate-180 text-[10px] font-mono tracking-[0.25em] text-muted-foreground/60 uppercase">
                EXPERIENCE SEAMLESS PAYMENTS .
              </div>

              {/* Wireframe Placeholder Card */}
              <div className="w-24 h-28 rounded-lg border border-dashed border-border/80 bg-background/30 p-2 flex flex-col justify-between opacity-50">
                <div className="flex gap-1">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 bg-muted-foreground/20 rounded-full w-full" />
                  <div className="h-1.5 bg-muted-foreground/20 rounded-full w-2/3" />
                </div>
              </div>
            </div>

            {/* Right Decorative Blueprint Column */}
            <div className="hidden lg:flex flex-col items-center justify-between absolute right-8 top-12 bottom-12 pointer-events-none select-none">
              {/* Wireframe Placeholder Card */}
              <div className="w-24 h-28 rounded-lg border border-dashed border-border/80 bg-background/30 p-2 flex flex-col justify-between opacity-50">
                <div className="space-y-1">
                  <div className="h-1.5 bg-muted-foreground/20 rounded-full w-full" />
                  <div className="h-1.5 bg-muted-foreground/20 rounded-full w-3/4" />
                </div>
                <div className="flex justify-end gap-1">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                </div>
              </div>

              {/* Vertical Monospace Badge */}
              <div className="py-8 my-auto [writing-mode:vertical-lr] text-[10px] font-mono tracking-[0.25em] text-muted-foreground/60 uppercase">
                EXPERIENCE SEAMLESS PAYMENTS .
              </div>

              {/* Dot Matrix 4x4 */}
              <div className="grid grid-cols-4 gap-1.5 opacity-30">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="size-1 rounded-full bg-foreground" />
                ))}
              </div>
            </div>

            {/* Center Content: Architecture Diagram */}
            <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
              {/* Top Node: API capsule */}
              <div className="flex flex-col items-center">
                <div className="px-3 py-1 rounded-md bg-white dark:bg-card border border-dashed border-border shadow-xs text-[11px] font-mono font-medium text-foreground tracking-wider uppercase">
                  API
                </div>
                {/* Connecting Vertical Line */}
                <div className="w-px h-8 bg-border border-l border-dashed border-muted-foreground/40" />
              </div>

              {/* The Hero White VISA Credit Card */}
              <div className="relative group perspective-1000 my-2">
                <div className="w-[340px] sm:w-[410px] h-[215px] sm:h-[245px] rounded-2xl bg-white dark:bg-[#1E1E24] text-zinc-900 dark:text-zinc-100 shadow-[0_20px_50px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-black/5 dark:border-white/10 p-6 flex flex-col justify-between transition-transform duration-300 group-hover:-translate-y-1">
                  {/* Card Top: Chip and Brand */}
                  <div className="flex items-center justify-between">
                    {/* Metallic Gold Chip */}
                    <div className="w-11 h-8 rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-400 border border-amber-500/30 p-1 flex flex-col justify-between shadow-2xs">
                      <div className="flex justify-between h-2">
                        <span className="w-2.5 border-b border-amber-600/40" />
                        <span className="w-2.5 border-b border-amber-600/40" />
                      </div>
                      <div className="h-px bg-amber-600/40 w-full" />
                      <div className="flex justify-between h-2">
                        <span className="w-2.5 border-t border-amber-600/40" />
                        <span className="w-2.5 border-t border-amber-600/40" />
                      </div>
                    </div>

                    {/* VISA / UPI Logo */}
                    <span className="text-xl sm:text-2xl font-black italic tracking-tighter text-zinc-900 dark:text-zinc-100 font-sans">
                      VISA
                    </span>
                  </div>

                  {/* Card Bottom: Holder Name, Number, Expiry */}
                  <div className="space-y-3 pt-6">
                    <div className="font-mono text-sm sm:text-base tracking-[0.2em] font-medium text-zinc-800 dark:text-zinc-200">
                      5367 4567 8901 2345
                    </div>

                    <div className="flex items-end justify-between text-xs">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-zinc-400">Cardholder</div>
                        <div className="font-medium text-zinc-800 dark:text-zinc-200">Méschac Irung</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wider text-zinc-400">Exp.</div>
                        <div className="font-mono font-medium text-zinc-800 dark:text-zinc-200">12/25</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Connecting Vertical Line */}
              <div className="w-px h-8 bg-border border-l border-dashed border-muted-foreground/40" />

              {/* Bottom Node: APP Connected capsule */}
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-card border border-dashed border-border shadow-xs text-xs font-medium text-foreground">
                <span className="flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px]">
                  ✓
                </span>
                <span>APP Connected</span>
              </div>

              {/* Floating Code Snippet Card (Bottom-Right of Card) */}
              <div className="mt-6 sm:mt-0 sm:absolute sm:-right-8 sm:bottom-4 w-full sm:w-[310px] rounded-xl bg-white dark:bg-[#1E1E24] border border-border/80 p-4 shadow-xl text-left font-mono text-[11px] leading-relaxed">
                <div className="text-muted-foreground space-y-0.5">
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">1</span>
                    <span>
                      <span className="text-purple-600 dark:text-purple-400 font-semibold">const</span> axios = require(
                      <span className="text-emerald-600 dark:text-emerald-400">'axios'</span>);
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">2</span>
                    <span></span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">3</span>
                    <span>
                      <span className="text-purple-600 dark:text-purple-400 font-semibold">const</span> response = <span className="text-blue-600 dark:text-blue-400 font-semibold">await</span> axios.post(
                      <span className="text-emerald-600 dark:text-emerald-400">'https://'</span>,
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">4</span>
                    <span className="pl-3">
                      key: <span className="text-emerald-600 dark:text-emerald-400">'value'</span>,
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">5</span>
                    <span className="pl-3">
                      anotherKey: <span className="text-emerald-600 dark:text-emerald-400">'anotherValue'</span>,
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">6</span>
                    <span>{"});"}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground/50 select-none w-3">7</span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Partner Logos Strip */}
      <section className="py-16 sm:py-20 border-y border-border/60 bg-white/50 dark:bg-card/20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Headline */}
            <div className="lg:col-span-4">
              <h3 className="text-lg font-medium text-foreground tracking-tight">
                Trusted by fast-growing companies around the world
              </h3>
              <a
                href="#integrations"
                className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#635BFF] hover:underline"
              >
                Read case studies
              </a>
            </div>

            {/* Right Logo Grid */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8 items-center">
              <div className="flex items-center justify-center font-bold text-xl tracking-tighter text-foreground/80 hover:text-foreground transition-colors">
                hulu
              </div>
              <div className="flex items-center justify-center gap-1.5 font-bold text-lg text-foreground/80 hover:text-foreground transition-colors">
                <span className="size-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">●</span>
                <span>Spotify</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 font-bold text-lg text-foreground/80 hover:text-foreground transition-colors">
                <span>⚡ supabase</span>
              </div>
              <div className="flex items-center justify-center font-serif font-bold text-lg text-foreground/80 hover:text-foreground transition-colors">
                Beacon
              </div>
              <div className="flex items-center justify-center gap-1.5 font-bold text-lg text-foreground/80 hover:text-foreground transition-colors">
                <span>▲ Vercel</span>
              </div>
              <div className="flex items-center justify-center font-bold text-xl tracking-tight text-foreground/80 hover:text-foreground transition-colors">
                stripe
              </div>
              <div className="flex items-center justify-center gap-1.5 font-bold text-base text-foreground/80 hover:text-foreground transition-colors">
                <span>≈ tailwindcss</span>
              </div>
              <div className="flex items-center justify-center font-bold text-xl tracking-tight text-foreground/80 hover:text-foreground transition-colors">
                stripe
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section: "Powerful integrations with our API" */}
      <section id="integrations" className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left Column: Heading and Description */}
            <div className="lg:col-span-4 lg:sticky lg:top-24">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.12]">
                Powerful integrations with our API
              </h2>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                Generate payment links at scale, enabling seamless marketing campaigns, efficient sales processes, and faster payment.
              </p>
            </div>

            {/* Right Column: Linear-style Data Board Preview */}
            <div className="lg:col-span-8 rounded-2xl border border-border/80 bg-white dark:bg-[#141419] shadow-xl overflow-hidden">
              {/* Window Controls & Action Bar */}
              <div className="p-4 border-b border-border/60 flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <div className="size-3 rounded-full bg-border" />
                  <div className="size-3 rounded-full bg-border" />
                  <div className="size-3 rounded-full bg-border" />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Search className="size-4 cursor-pointer hover:text-foreground" />
                  <Bell className="size-4 cursor-pointer hover:text-foreground" />
                  <span className="flex items-center gap-1 font-medium cursor-pointer hover:text-foreground">
                    <SlidersHorizontal className="size-3.5" /> Display
                  </span>
                </div>
              </div>

              {/* Filter Bar with Dropdown Popover */}
              <div className="p-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-3 bg-muted/10">
                <div className="relative">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-border bg-white dark:bg-card text-xs font-medium text-foreground shadow-2xs">
                    <SlidersHorizontal className="size-3" />
                    <span>Filter</span>
                  </div>

                  {/* Open Dropdown Menu as seen in Tailark screenshot */}
                  <div className="mt-2 w-48 rounded-lg border border-border bg-white dark:bg-card p-1.5 shadow-lg text-xs">
                    {[
                      { name: "Status", active: true },
                      { name: "Assignee", active: false },
                      { name: "Priority", active: false },
                      { name: "Labels", active: false },
                      { name: "Project", active: false },
                    ].map((item) => (
                      <div
                        key={item.name}
                        onClick={() => setActiveFilter(item.name)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                          activeFilter === item.name
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {item.active && <Check className="size-3.5 text-foreground" />}
                          <span>{item.name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">›</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground font-mono">
                  6 active records
                </div>
              </div>

              {/* Data Table Rows */}
              <div className="divide-y divide-border/50 text-xs">
                {/* Group Header */}
                <div className="px-4 py-2 bg-muted/30 font-semibold text-muted-foreground flex items-center gap-2">
                  <Clock className="size-3 text-emerald-500" />
                  <span>Technical Review</span>
                  <span className="text-[10px] font-mono rounded-full bg-muted px-1.5 py-0.2">6</span>
                </div>

                {[
                  {
                    id: "LNUI-512",
                    title: "Enhance Breadcrumb navigation usability",
                    tag: "Performance",
                    tagColor: "bg-amber-500/10 text-amber-600",
                    module: "LNDev UI - Sidebar",
                    date: "Apr 02",
                  },
                  {
                    id: "LNUI-525",
                    title: "Update Alert system for critical notifications",
                    tag: "Testing",
                    tagColor: "bg-blue-500/10 text-blue-600",
                    module: "LNDev UI - Sidebar",
                    date: "Apr 03",
                  },
                  {
                    id: "LNUI-513",
                    title: "Refactor Accordion for smoother transitions",
                    tag: "Documentation",
                    tagColor: "bg-purple-500/10 text-purple-600",
                    module: "LNDev UI - Core Components",
                    date: "Mar 22",
                  },
                  {
                    id: "LNUI-505",
                    title: "Improve Tooltip interactivity",
                    tag: "Accessibility",
                    tagColor: "bg-emerald-500/10 text-emerald-600",
                    module: "LNDev UI - Cards",
                    date: "Mar 14",
                  },
                  {
                    id: "LNUI-415",
                    title: "Design new modal system with focus trapping",
                    tag: "Documentation",
                    tagColor: "bg-purple-500/10 text-purple-600",
                    module: "LNDev UI - Modals",
                    date: "Mar 09",
                  },
                  {
                    id: "LNUI-501",
                    title: "Enhance responsiveness of Navbar",
                    tag: "Refactor",
                    tagColor: "bg-rose-500/10 text-rose-600",
                    module: "LNDev UI - Layout",
                    date: "Mar 10",
                  },
                ].map((row) => (
                  <div
                    key={row.id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-muted-foreground text-[11px]">{row.id}</span>
                      <span className="font-medium text-foreground">{row.title}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${row.tagColor}`}>
                        {row.tag}
                      </span>
                      <span className="text-muted-foreground text-[11px] hidden sm:inline">
                        {row.module}
                      </span>
                      <span className="text-muted-foreground text-[11px] font-mono">{row.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section (From Libre Pricing One) */}
      <section id="pricing" className="py-20 sm:py-28 border-t border-border/60 bg-white/40 dark:bg-card/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Pricing that scale <br />
            with your business
          </h2>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            Choose the perfect plan for your needs and start optimizing your workflow today
          </p>

          {/* Monthly / Annually Pill Switcher */}
          <div className="mt-8 inline-flex items-center rounded-full bg-muted p-1 text-xs font-medium">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-full px-4 py-1.5 transition-colors cursor-pointer ${
                billingCycle === "monthly" ? "bg-white dark:bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annually")}
              className={`rounded-full px-4 py-1.5 transition-colors cursor-pointer ${
                billingCycle === "annually" ? "bg-white dark:bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground"
              }`}
            >
              Annually
            </button>
          </div>
          <div className="mt-2 text-xs font-medium text-[#635BFF]">
            Save 25% On Annual Billing
          </div>

          {/* Pricing Cards Grid */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 text-left max-w-2xl mx-auto">
            {/* Free Plan */}
            <div className="rounded-2xl border border-border/80 bg-white dark:bg-card p-8 flex flex-col justify-between shadow-xs">
              <div>
                <h3 className="font-semibold text-lg text-foreground">Free</h3>
                <p className="mt-1 text-xs text-muted-foreground">For developers trying out Tailark for the first time</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">$0</span>
                  <span className="text-xs text-muted-foreground">Per month</span>
                </div>

                <Link
                  href="/signup"
                  className="mt-6 w-full inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white dark:bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-2xs"
                >
                  Get Started
                </Link>

                <ul className="mt-8 space-y-3 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2.5 text-foreground">
                    <Check className="size-3.5 text-emerald-500" />
                    <span>Basic Analytics Dashboard</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-foreground">
                    <Check className="size-3.5 text-emerald-500" />
                    <span>5GB Cloud Storage</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-foreground">
                    <Check className="size-3.5 text-emerald-500" />
                    <span>Email and Chat Support</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="rounded-2xl border border-border/80 bg-white dark:bg-card p-8 flex flex-col justify-between shadow-xl ring-1 ring-black/5 dark:ring-white/10 relative">
              <div>
                <h3 className="font-semibold text-lg text-foreground">Pro</h3>
                <p className="mt-1 text-xs text-muted-foreground">Ideal for developers who need more features and support</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">
                    {billingCycle === "annually" ? "$14" : "$19"}
                  </span>
                  <span className="text-xs text-muted-foreground">Per month</span>
                </div>

                <Link
                  href="/signup"
                  className="mt-6 w-full inline-flex h-10 items-center justify-center rounded-lg bg-[#635BFF] hover:bg-[#5851EA] text-xs font-medium text-white transition-all shadow-sm active:scale-95"
                >
                  Get Started
                </Link>

                <div className="mt-8 text-xs font-medium text-foreground">Everything in Free Plan plus:</div>
                <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                  {[
                    "5GB Cloud Storage",
                    "Email and Chat Support",
                    "Access to Community Forum",
                    "Single User Access",
                    "Access to Basic Templates",
                    "Mobile App Access",
                    "1 Custom Report Per Month",
                    "Monthly Product Updates",
                    "Standard Security Features",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-2.5 text-foreground">
                      <Check className="size-3.5 text-[#635BFF]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Footer — Tailark Libre Style */}
      <footer className="py-12 border-t border-border/60 bg-white dark:bg-[#0D0D11] text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground font-mono lowercase">stripe</span>
            <span>· libre landing design</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#integrations" className="hover:text-foreground transition-colors">API</a>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Get Started</Link>
          </div>
          <div>© {new Date().getFullYear()} Tailark · All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
