import { SproutIcon } from "lucide-react"

export function AuthShell({
  title,
  subtitle,
  children,
  panelTitle = "Fees, collected calmly.",
  panelSubtitle = "Students, fee structures, receipts, and WhatsApp announcements — in one quiet workspace.",
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  panelTitle?: string
  panelSubtitle?: string
}) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col p-6 md:p-10">
        <a href="/" className="flex w-fit items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
            <SproutIcon className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Seeds of Success</span>
        </a>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[360px]">
            <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 Seeds of Success · Fees Manager</p>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[#101014]">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.14), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.1), transparent 45%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />
        </div>
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {["S", "R", "A"].map((c) => (
                  <span key={c} className="flex size-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold">
                    {c}
                  </span>
                ))}
              </div>
              <div className="text-xs text-white/70">Trusted by school offices</div>
            </div>
            <p className="mt-4 text-xl font-medium tracking-tight">{panelTitle}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/65">{panelSubtitle}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
