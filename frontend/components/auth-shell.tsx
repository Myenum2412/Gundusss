import * as React from "react"
import { SproutIcon } from "lucide-react"

const highlights = [
  { value: "STU · GRP · RCP", label: "Auto-numbered records" },
  { value: "WhatsApp", label: "One-by-one broadcasts" },
  { value: "Live", label: "Dropdowns sync everywhere" },
]

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col p-6 sm:p-10">
        <a href="/" className="flex w-fit items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-700 text-primary-foreground shadow-md shadow-primary/25">
            <SproutIcon className="size-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold tracking-tight">Seeds of Success</span>
            <span className="block text-[11.5px] text-muted-foreground">Fees Manager</span>
          </span>
        </a>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="animate-enter w-full max-w-[400px]">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-primary uppercase">{eyebrow}</p>
            <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-balance">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Enterprise-grade fee operations · Secure by design
        </p>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1B1446] via-[#2B1E7A] to-[#4F46E5]" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgb(255 255 255 / 0.22), transparent 42%), radial-gradient(circle at 85% 15%, rgb(255 255 255 / 0.14), transparent 38%), radial-gradient(circle at 70% 85%, rgb(0 0 0 / 0.35), transparent 55%)",
          }}
        />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2 text-white/70">
            <span className="size-2 rounded-full bg-emerald-300" />
            <span className="text-xs font-medium tracking-wide">All systems operational</span>
          </div>
          <div>
            <blockquote className="max-w-md text-[26px] leading-snug font-medium tracking-tight text-balance">
              “Fee collection finally feels effortless — students, receipts, and WhatsApp reminders in one calm workspace.”
            </blockquote>
            <p className="mt-4 text-sm text-white/70">Trusted by fee offices running daily collections</p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
              {highlights.map((h) => (
                <div key={h.label} className="rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md">
                  <p className="text-sm font-semibold">{h.value}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/70">{h.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
