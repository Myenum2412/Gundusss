"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { sameJson } from "@/lib/live"
import {
  WEEKDAYS,
  loadBusinessProfile,
  saveBusinessProfile,
  type BusinessProfile,
  type DayHours,
  type SpecialHours,
  type Weekday,
} from "@/lib/business-profile"
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  InfoIcon,
  Link2Icon,
  ListChecksIcon,
  Loader2Icon,
  MapPinIcon,
  MessageSquareIcon,
  NavigationIcon,
  PhoneIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  ShieldCheckIcon,
  StoreIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

const CATEGORY_OPTIONS = [
  "Educational institution",
  "Tutoring service",
  "Coaching center",
  "School",
  "Test preparation center",
  "Learning center",
  "Private school",
  "Vocational school",
  "Training centre",
  "Business management consultant",
]

const TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
]

const ATTRIBUTE_GROUPS: {
  key: keyof BusinessProfile["attributes"]
  title: string
  options: string[]
}[] = [
  {
    key: "serviceOptions",
    title: "Service options",
    options: [
      "On-site services",
      "Online classes",
      "Appointment required",
      "Walk-ins welcome",
      "Home visits",
    ],
  },
  {
    key: "accessibility",
    title: "Accessibility",
    options: [
      "Wheelchair accessible entrance",
      "Wheelchair accessible parking lot",
      "Wheelchair accessible restroom",
      "Wheelchair accessible seating",
      "Assistive hearing loop",
    ],
  },
  {
    key: "amenities",
    title: "Amenities",
    options: [
      "Free Wi-Fi",
      "Restroom",
      "Air conditioning",
      "Study material",
      "Waiting area",
      "Drinking water",
    ],
  },
  {
    key: "payments",
    title: "Payments accepted",
    options: [
      "Cash",
      "UPI",
      "Credit cards",
      "Debit cards",
      "NFC mobile payments",
      "Cheques",
      "Bank transfer",
    ],
  },
  {
    key: "parking",
    title: "Parking",
    options: [
      "Free parking lot",
      "Paid parking lot",
      "Street parking",
      "Parking near the entrance",
    ],
  },
  {
    key: "highlights",
    title: "From the business",
    options: [
      "Women-owned",
      "Veteran-led",
      "Family-owned",
      "Locally owned",
      "LGBTQ+ friendly",
      "Online appointments",
    ],
  },
]

const timeInputClass =
  "h-8 rounded-lg border border-input bg-card px-2 text-xs shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function VerificationPill({
  value,
}: {
  value: BusinessProfile["verificationStatus"]
}) {
  const tone =
    value === "Verified"
      ? "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : value === "Pending"
        ? "border-amber-600/20 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
        : "border-border bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
        tone
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {value}
    </span>
  )
}

function StatusPill({ value }: { value: BusinessProfile["status"] }) {
  const tone =
    value === "Open"
      ? "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : value === "Temporarily closed"
        ? "border-amber-600/20 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
        : "border-red-600/20 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
        tone
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {value}
    </span>
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-background p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        {title}
      </h2>
      {description && (
        <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  description,
  maxLength,
  list,
  autoComplete,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  description?: string
  maxLength?: number
  list?: string
  autoComplete?: string
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        list={list}
        autoComplete={autoComplete}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  description,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  maxLength?: number
  description?: string
  className?: string
}) {
  return (
    <Field className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {maxLength && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  description,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  description?: string
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
      >
        {children}
      </select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function TagInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  id: string
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  description?: string
}) {
  const [draft, setDraft] = useState("")

  function add() {
    const next = draft.trim()
    if (!next) return
    if (!value.some((item) => item.toLowerCase() === next.toLowerCase())) {
      onChange([...value, next])
    }
    setDraft("")
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="rounded-[10px] border border-input bg-card p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 dark:bg-input/30">
        {value.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {value.map((item) => (
              <span
                key={item}
                className="inline-flex h-6 items-center gap-1 rounded-full border bg-muted/50 pr-1 pl-2 text-xs"
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => onChange(value.filter((entry) => entry !== item))}
                  className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                add()
              }
            }}
            placeholder={placeholder}
            className="h-7 w-full min-w-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={!draft.trim()}
          >
            <PlusIcon className="size-3.5" />
            Add
          </Button>
        </div>
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/30">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
    </label>
  )
}

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: string[]
  selected: string[]
  onToggle: (option: string) => void
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = selected.includes(option)
          return (
            <label
              key={option}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                checked
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(option)}
                className="size-3 accent-primary"
              />
              {option}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function ImagePreview({
  url,
  label,
  className,
}: {
  url: string
  label: string
  className?: string
}) {
  if (!url.trim()) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed bg-muted/20 p-2 text-center text-[11px] text-muted-foreground",
          className
        )}
      >
        {label}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label}
      className={cn("rounded-xl border bg-muted/20 object-cover", className)}
    />
  )
}

export default function BusinessProfileForm() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [saved, setSaved] = useState<BusinessProfile | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{
    tone: "success" | "warning" | "error"
    text: string
  } | null>(null)

  useEffect(() => {
    let active = true
    loadBusinessProfile().then((loaded) => {
      if (!active) return
      setProfile(loaded.profile)
      setSaved(loaded.profile)
      setUpdatedAt(loaded.updatedAt)
      setOnline(loaded.online)
      setLoading(false)
      if (!loaded.online) {
        setNotice({
          tone: "warning",
          text: "The backend is unreachable. Showing the copy saved on this device — saves will stay local until it reconnects.",
        })
      }
    })
    return () => {
      active = false
    }
  }, [])

  const dirty = useMemo(
    () => Boolean(profile && saved && !sameJson(profile, saved)),
    [profile, saved]
  )

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const completion = useMemo(() => {
    if (!profile) return { done: 0, total: 0 }
    const checks = [
      Boolean(profile.name.trim()),
      Boolean(profile.primaryCategory.trim()),
      profile.description.trim().length >= 40,
      Boolean(profile.phone.trim()),
      Boolean(profile.email.trim() || profile.website.trim()),
      Boolean(
        profile.location.addressLine1.trim() || profile.location.serviceArea
      ),
      Boolean(profile.location.city.trim() || profile.location.serviceArea),
      Object.values(profile.hours.days).some((day) => day.open),
      Boolean(profile.media.logoUrl.trim()),
      Boolean(profile.media.coverUrl.trim()),
      profile.attributes.payments.length > 0,
      Object.values(profile.social).some(Boolean),
    ]
    return { done: checks.filter(Boolean).length, total: checks.length }
  }, [profile])

  function patch<K extends keyof BusinessProfile>(
    key: K,
    value: BusinessProfile[K]
  ) {
    setProfile((current) =>
      current ? ({ ...current, [key]: value } as BusinessProfile) : current
    )
  }

  function patchSection<
    K extends "social" | "location" | "hours" | "attributes" | "media" | "links",
  >(key: K, value: Partial<BusinessProfile[K]>) {
    setProfile((current) =>
      current
        ? ({
            ...current,
            [key]: { ...current[key], ...value },
          } as BusinessProfile)
        : current
    )
  }

  function updateDay(dayKey: Weekday, changes: Partial<DayHours>) {
    setProfile((current) =>
      current
        ? {
            ...current,
            hours: {
              ...current.hours,
              days: {
                ...current.hours.days,
                [dayKey]: { ...current.hours.days[dayKey], ...changes },
              },
            },
          }
        : current
    )
  }

  function addSpecial() {
    setProfile((current) =>
      current
        ? {
            ...current,
            hours: {
              ...current.hours,
              special: [
                ...current.hours.special,
                {
                  id: `special-${Date.now()}`,
                  label: "",
                  date: "",
                  closed: false,
                  from: "09:00",
                  to: "17:00",
                },
              ],
            },
          }
        : current
    )
  }

  function updateSpecial(id: string, changes: Partial<SpecialHours>) {
    setProfile((current) =>
      current
        ? {
            ...current,
            hours: {
              ...current.hours,
              special: current.hours.special.map((entry) =>
                entry.id === id ? { ...entry, ...changes } : entry
              ),
            },
          }
        : current
    )
  }

  function removeSpecial(id: string) {
    setProfile((current) =>
      current
        ? {
            ...current,
            hours: {
              ...current.hours,
              special: current.hours.special.filter((entry) => entry.id !== id),
            },
          }
        : current
    )
  }

  function toggleAttribute(
    key: keyof BusinessProfile["attributes"],
    option: string
  ) {
    setProfile((current) => {
      if (!current) return current
      const values = current.attributes[key]
      const next = values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option]
      return {
        ...current,
        attributes: { ...current.attributes, [key]: next },
      }
    })
  }

  async function onSave() {
    if (!profile || saving) return
    setSaving(true)
    setNotice(null)
    const result = await saveBusinessProfile(profile)
    setSaving(false)
    setSaved(profile)
    setUpdatedAt(result.updatedAt)
    setOnline(result.ok)
    if (result.ok) {
      setNotice({
        tone: "success",
        text: `Saved to Postgres${result.updatedAt ? ` · ${formatTimestamp(result.updatedAt)}` : ""}.`,
      })
    } else {
      setNotice({
        tone: "warning",
        text: "Saved on this device. The backend is unreachable, so changes are not synced yet.",
      })
    }
  }

  function onReset() {
    if (!saved) return
    setProfile(saved)
    setNotice(null)
  }

  if (loading || !profile) {
    return (
      <section className="w-full shrink-0">
        <div className="rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading Google Business details…
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-9 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        </div>
      </section>
    )
  }

  const completionPercent =
    completion.total > 0
      ? Math.round((completion.done / completion.total) * 100)
      : 0

  const noticeClasses =
    notice?.tone === "success"
      ? "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : notice?.tone === "warning"
        ? "border-amber-600/20 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
        : "border-destructive/20 bg-destructive/5 text-destructive"

  return (
    <section className="w-full shrink-0">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="border-b bg-muted/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-[#4285F4] text-xl font-bold text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
                G
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight">
                    Google Business Profile
                  </h2>
                  <VerificationPill value={profile.verificationStatus} />
                  <StatusPill value={profile.status} />
                  {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
                  {!online && (
                    <Badge
                      variant="outline"
                      className="border-amber-600/30 text-amber-700 dark:text-amber-400"
                    >
                      Offline
                    </Badge>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                  Everything customers see on Google Search and Maps — identity,
                  contact details, location, hours, attributes, photos, and
                  booking links.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {completion.done} of {completion.total} details complete ·{" "}
                    {completionPercent}%
                  </span>
                  {updatedAt && (
                    <span className="text-xs text-muted-foreground">
                      · Last saved {formatTimestamp(updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href="https://business.google.com"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <ExternalLinkIcon className="size-3.5" />
                Google Business
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={!dirty || saving}
              >
                <RotateCcwIcon className="size-3.5" />
                Reset
              </Button>
              <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
                {saving ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <SaveIcon className="size-3.5" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {notice && (
            <div
              className={cn(
                "mb-4 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm",
                noticeClasses
              )}
            >
              <span className="flex items-start gap-2">
                {notice.tone === "success" ? (
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                )}
                {notice.text}
              </span>
              <button
                type="button"
                aria-label="Dismiss message"
                className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                onClick={() => setNotice(null)}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}

          <Tabs defaultValue="basics" className="gap-5">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="basics" className="gap-1.5 px-3">
                <StoreIcon className="size-3.5" />
                Basics
              </TabsTrigger>
              <TabsTrigger value="contact" className="gap-1.5 px-3">
                <PhoneIcon className="size-3.5" />
                Contact
              </TabsTrigger>
              <TabsTrigger value="location" className="gap-1.5 px-3">
                <MapPinIcon className="size-3.5" />
                Location
              </TabsTrigger>
              <TabsTrigger value="hours" className="gap-1.5 px-3">
                <ClockIcon className="size-3.5" />
                Hours
              </TabsTrigger>
              <TabsTrigger value="attributes" className="gap-1.5 px-3">
                <ListChecksIcon className="size-3.5" />
                Attributes & media
              </TabsTrigger>
            </TabsList>

            {/* ---------------------------------------------------------- Basics */}
            <TabsContent value="basics" className="flex flex-col gap-4">
              <SectionCard
                icon={StoreIcon}
                title="Business identity"
                description="The core details Google uses to match your listing to searches."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="bp-name"
                    label="Business name"
                    required
                    value={profile.name}
                    onChange={(value) => patch("name", value)}
                    placeholder="e.g. Seeds of Success"
                    maxLength={200}
                  />
                  <TextField
                    id="bp-category"
                    label="Primary category"
                    required
                    value={profile.primaryCategory}
                    onChange={(value) => patch("primaryCategory", value)}
                    placeholder="e.g. Tutoring service"
                    list="bp-categories"
                  />
                  <datalist id="bp-categories">
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <SelectField
                    id="bp-type"
                    label="Business type"
                    value={profile.businessType}
                    onChange={(value) =>
                      patch(
                        "businessType",
                        value as BusinessProfile["businessType"]
                      )
                    }
                  >
                    <option value="On-site">On-site</option>
                    <option value="Online">Online</option>
                    <option value="Hybrid">Hybrid</option>
                  </SelectField>
                  <SelectField
                    id="bp-status"
                    label="Listing status"
                    value={profile.status}
                    onChange={(value) =>
                      patch("status", value as BusinessProfile["status"])
                    }
                  >
                    <option value="Open">Open</option>
                    <option value="Temporarily closed">Temporarily closed</option>
                    <option value="Permanently closed">
                      Permanently closed
                    </option>
                  </SelectField>
                  <TextField
                    id="bp-opening"
                    label="Opening date"
                    type="date"
                    value={profile.openingDate}
                    onChange={(value) => patch("openingDate", value)}
                  />
                  <TagInput
                    id="bp-labels"
                    label="Labels"
                    value={profile.labels}
                    onChange={(value) => patch("labels", value)}
                    placeholder="e.g. Weekend batches"
                    description="Private labels help you organise the listing. They are not shown to customers."
                  />
                  <TagInput
                    id="bp-additional"
                    label="Additional categories"
                    value={profile.additionalCategories}
                    onChange={(value) => patch("additionalCategories", value)}
                    placeholder="Add another category"
                    description="Google allows a few extra categories to describe related services."
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={FileTextIcon}
                title="Business description"
                description="Tell customers what you offer, who you serve, and what makes your business unique."
              >
                <TextAreaField
                  id="bp-description"
                  label="Description"
                  value={profile.description}
                  onChange={(value) => patch("description", value)}
                  placeholder="Seeds of Success is a learning centre that helps students build strong foundations through small-group tuition, regular assessments, and personal attention…"
                  rows={6}
                  maxLength={750}
                  description="Up to 750 characters. Avoid promotional language, links, and prices."
                />
              </SectionCard>

              <SectionCard
                icon={ShieldCheckIcon}
                title="Verification"
                description="Keep the listing status in sync with your Google Business Profile."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id="bp-verification"
                    label="Verification status"
                    value={profile.verificationStatus}
                    onChange={(value) =>
                      patch(
                        "verificationStatus",
                        value as BusinessProfile["verificationStatus"]
                      )
                    }
                  >
                    <option value="Unverified">Unverified</option>
                    <option value="Pending">Pending</option>
                    <option value="Verified">Verified</option>
                  </SelectField>
                  <TextField
                    id="bp-verified-on"
                    label="Verified on"
                    type="date"
                    value={profile.verifiedOn}
                    onChange={(value) => patch("verifiedOn", value)}
                  />
                </div>
              </SectionCard>
            </TabsContent>

            {/* --------------------------------------------------------- Contact */}
            <TabsContent value="contact" className="flex flex-col gap-4">
              <SectionCard
                icon={PhoneIcon}
                title="Contact details"
                description="Customers use these to call, message, or visit your website."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="bp-phone"
                    label="Primary phone"
                    type="tel"
                    value={profile.phone}
                    onChange={(value) => patch("phone", value)}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                  />
                  <TextField
                    id="bp-secondary-phone"
                    label="Secondary phone"
                    type="tel"
                    value={profile.secondaryPhone}
                    onChange={(value) => patch("secondaryPhone", value)}
                    placeholder="Optional alternate number"
                  />
                  <TextField
                    id="bp-email"
                    label="Email"
                    type="email"
                    value={profile.email}
                    onChange={(value) => patch("email", value)}
                    placeholder="hello@seedsofsuccess.in"
                    autoComplete="email"
                  />
                  <TextField
                    id="bp-whatsapp"
                    label="WhatsApp"
                    type="tel"
                    value={profile.whatsapp}
                    onChange={(value) => patch("whatsapp", value)}
                    placeholder="+91 98765 43210"
                  />
                  <TextField
                    id="bp-website"
                    label="Website"
                    type="url"
                    value={profile.website}
                    onChange={(value) => patch("website", value)}
                    placeholder="https://seedsofsuccess.in"
                    className="sm:col-span-2"
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={GlobeIcon}
                title="Social profiles"
                description="Add the profiles you want linked from your Google listing."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="bp-facebook"
                    label="Facebook"
                    type="url"
                    value={profile.social.facebook}
                    onChange={(value) =>
                      patchSection("social", { facebook: value })
                    }
                    placeholder="https://facebook.com/…"
                  />
                  <TextField
                    id="bp-instagram"
                    label="Instagram"
                    type="url"
                    value={profile.social.instagram}
                    onChange={(value) =>
                      patchSection("social", { instagram: value })
                    }
                    placeholder="https://instagram.com/…"
                  />
                  <TextField
                    id="bp-x"
                    label="X (Twitter)"
                    type="url"
                    value={profile.social.x}
                    onChange={(value) => patchSection("social", { x: value })}
                    placeholder="https://x.com/…"
                  />
                  <TextField
                    id="bp-youtube"
                    label="YouTube"
                    type="url"
                    value={profile.social.youtube}
                    onChange={(value) =>
                      patchSection("social", { youtube: value })
                    }
                    placeholder="https://youtube.com/@…"
                  />
                  <TextField
                    id="bp-linkedin"
                    label="LinkedIn"
                    type="url"
                    value={profile.social.linkedin}
                    onChange={(value) =>
                      patchSection("social", { linkedin: value })
                    }
                    placeholder="https://linkedin.com/company/…"
                    className="sm:col-span-2"
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={Link2Icon}
                title="Booking & action links"
                description="Give customers a direct path to book, order, or learn more."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="bp-appointment"
                    label="Appointment URL"
                    type="url"
                    value={profile.links.appointmentUrl}
                    onChange={(value) =>
                      patchSection("links", { appointmentUrl: value })
                    }
                    placeholder="https://…"
                  />
                  <TextField
                    id="bp-reservation"
                    label="Reservation URL"
                    type="url"
                    value={profile.links.reservationUrl}
                    onChange={(value) =>
                      patchSection("links", { reservationUrl: value })
                    }
                    placeholder="https://…"
                  />
                  <TextField
                    id="bp-order"
                    label="Order ahead URL"
                    type="url"
                    value={profile.links.orderAheadUrl}
                    onChange={(value) =>
                      patchSection("links", { orderAheadUrl: value })
                    }
                    placeholder="https://…"
                  />
                  <TextField
                    id="bp-menu"
                    label="Menu / brochure URL"
                    type="url"
                    value={profile.links.menuUrl}
                    onChange={(value) =>
                      patchSection("links", { menuUrl: value })
                    }
                    placeholder="https://…"
                  />
                  <TextField
                    id="bp-profile-url"
                    label="Google Business Profile URL"
                    type="url"
                    value={profile.links.profileUrl}
                    onChange={(value) =>
                      patchSection("links", { profileUrl: value })
                    }
                    placeholder="https://g.page/…"
                  />
                  <TextField
                    id="bp-place-id"
                    label="Place ID"
                    value={profile.links.placeId}
                    onChange={(value) =>
                      patchSection("links", { placeId: value })
                    }
                    placeholder="Google Maps place ID"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <Toggle
                    label="Allow customers to message you"
                    description="Shows a Message button on your Google listing."
                    checked={profile.messagingEnabled}
                    onChange={(value) => patch("messagingEnabled", value)}
                  />
                  <TextAreaField
                    id="bp-booking-policy"
                    label="Booking policy"
                    value={profile.links.bookingPolicy}
                    onChange={(value) =>
                      patchSection("links", { bookingPolicy: value })
                    }
                    placeholder="Cancellations must be made at least 24 hours in advance…"
                    rows={3}
                  />
                </div>
              </SectionCard>
            </TabsContent>

            {/* -------------------------------------------------------- Location */}
            <TabsContent value="location" className="flex flex-col gap-4">
              <SectionCard
                icon={MapPinIcon}
                title="Business address"
                description="Use the exact address customers should see on Maps."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="bp-address-1"
                    label="Address line 1"
                    value={profile.location.addressLine1}
                    onChange={(value) =>
                      patchSection("location", { addressLine1: value })
                    }
                    placeholder="Building, street"
                    className="sm:col-span-2"
                  />
                  <TextField
                    id="bp-address-2"
                    label="Address line 2"
                    value={profile.location.addressLine2}
                    onChange={(value) =>
                      patchSection("location", { addressLine2: value })
                    }
                    placeholder="Floor, landmark"
                    className="sm:col-span-2"
                  />
                  <TextField
                    id="bp-locality"
                    label="Locality / area"
                    value={profile.location.locality}
                    onChange={(value) =>
                      patchSection("location", { locality: value })
                    }
                    placeholder="e.g. Indiranagar"
                  />
                  <TextField
                    id="bp-city"
                    label="City"
                    value={profile.location.city}
                    onChange={(value) =>
                      patchSection("location", { city: value })
                    }
                    placeholder="e.g. Bengaluru"
                  />
                  <TextField
                    id="bp-state"
                    label="State"
                    value={profile.location.state}
                    onChange={(value) =>
                      patchSection("location", { state: value })
                    }
                    placeholder="e.g. Karnataka"
                  />
                  <TextField
                    id="bp-postal"
                    label="Postal code"
                    value={profile.location.postalCode}
                    onChange={(value) =>
                      patchSection("location", { postalCode: value })
                    }
                    placeholder="e.g. 560038"
                  />
                  <TextField
                    id="bp-country"
                    label="Country"
                    value={profile.location.country}
                    onChange={(value) =>
                      patchSection("location", { country: value })
                    }
                    placeholder="e.g. India"
                  />
                  <TextField
                    id="bp-map-url"
                    label="Google Maps URL"
                    type="url"
                    value={profile.location.mapUrl}
                    onChange={(value) =>
                      patchSection("location", { mapUrl: value })
                    }
                    placeholder="https://maps.google.com/…"
                  />
                </div>
                <div className="mt-4">
                  <Toggle
                    label="Hide the exact address"
                    description="Use this for a service-area business that visits customers instead."
                    checked={profile.location.hideAddress}
                    onChange={(value) =>
                      patchSection("location", { hideAddress: value })
                    }
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={NavigationIcon}
                title="Service area"
                description="Show the areas you serve when you do not have a customer-facing location."
              >
                <Toggle
                  label="I serve customers at their location"
                  description="Add the cities, neighbourhoods, or regions you cover."
                  checked={profile.location.serviceArea}
                  onChange={(value) =>
                    patchSection("location", { serviceArea: value })
                  }
                />
                {profile.location.serviceArea && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <TagInput
                      id="bp-service-areas"
                      label="Service areas"
                      value={profile.location.serviceAreas}
                      onChange={(value) =>
                        patchSection("location", { serviceAreas: value })
                      }
                      placeholder="e.g. Indiranagar"
                      description="Press Enter after each area."
                    />
                    <TextField
                      id="bp-radius"
                      label="Service radius (km)"
                      value={profile.location.serviceRadiusKm}
                      onChange={(value) =>
                        patchSection("location", { serviceRadiusKm: value })
                      }
                      placeholder="e.g. 15"
                    />
                    <TextField
                      id="bp-latitude"
                      label="Latitude"
                      value={profile.location.latitude}
                      onChange={(value) =>
                        patchSection("location", { latitude: value })
                      }
                      placeholder="e.g. 12.9716"
                    />
                    <TextField
                      id="bp-longitude"
                      label="Longitude"
                      value={profile.location.longitude}
                      onChange={(value) =>
                        patchSection("location", { longitude: value })
                      }
                      placeholder="e.g. 77.5946"
                    />
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            {/* ----------------------------------------------------------- Hours */}
            <TabsContent value="hours" className="flex flex-col gap-4">
              <SectionCard
                icon={ClockIcon}
                title="Regular hours"
                description="Set the hours customers can visit or call each week."
              >
                <TextField
                  id="bp-timezone"
                  label="Time zone"
                  value={profile.hours.timezone}
                  onChange={(value) =>
                    patchSection("hours", { timezone: value })
                  }
                  placeholder="Asia/Kolkata"
                  list="bp-timezones"
                />
                <datalist id="bp-timezones">
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>

                <div className="mt-4 divide-y rounded-xl border">
                  {WEEKDAYS.map(({ key, label }) => {
                    const day = profile.hours.days[key]
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <label className="flex w-28 items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={day.open}
                            onChange={(event) =>
                              updateDay(key, { open: event.target.checked })
                            }
                            className="size-3.5 accent-primary"
                          />
                          {label}
                        </label>
                        {day.open ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={day.allDay}
                                onChange={(event) =>
                                  updateDay(key, {
                                    allDay: event.target.checked,
                                  })
                                }
                                className="size-3 accent-primary"
                              />
                              Open 24 hours
                            </label>
                            {!day.allDay && (
                              <>
                                <input
                                  type="time"
                                  aria-label={`${label} opening time`}
                                  value={day.from}
                                  onChange={(event) =>
                                    updateDay(key, { from: event.target.value })
                                  }
                                  className={timeInputClass}
                                />
                                <span className="text-xs text-muted-foreground">
                                  to
                                </span>
                                <input
                                  type="time"
                                  aria-label={`${label} closing time`}
                                  value={day.to}
                                  onChange={(event) =>
                                    updateDay(key, { to: event.target.value })
                                  }
                                  className={timeInputClass}
                                />
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Closed
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </SectionCard>

              <SectionCard
                icon={CalendarDaysIcon}
                title="Special hours"
                description="Holidays, events, or one-off changes to your regular hours."
              >
                {profile.hours.special.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No special hours yet — add one for a holiday or event.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {profile.hours.special.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-2 rounded-xl border p-3"
                      >
                        <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <Input
                            value={entry.label}
                            onChange={(event) =>
                              updateSpecial(entry.id, {
                                label: event.target.value,
                              })
                            }
                            placeholder="Label (e.g. Diwali)"
                            className="h-8 text-xs"
                          />
                          <Input
                            type="date"
                            value={entry.date}
                            onChange={(event) =>
                              updateSpecial(entry.id, {
                                date: event.target.value,
                              })
                            }
                            aria-label="Special hours date"
                            className="h-8 text-xs"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={entry.closed}
                              onChange={(event) =>
                                updateSpecial(entry.id, {
                                  closed: event.target.checked,
                                })
                              }
                              className="size-3 accent-primary"
                            />
                            Closed
                          </label>
                          {!entry.closed && (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                aria-label="Special hours opening time"
                                value={entry.from}
                                onChange={(event) =>
                                  updateSpecial(entry.id, {
                                    from: event.target.value,
                                  })
                                }
                                className={timeInputClass}
                              />
                              <span className="text-xs text-muted-foreground">
                                to
                              </span>
                              <input
                                type="time"
                                aria-label="Special hours closing time"
                                value={entry.to}
                                onChange={(event) =>
                                  updateSpecial(entry.id, {
                                    to: event.target.value,
                                  })
                                }
                                className={timeInputClass}
                              />
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove special hours"
                          onClick={() => removeSpecial(entry.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={addSpecial}
                >
                  <PlusIcon className="size-3.5" />
                  Add special hours
                </Button>
              </SectionCard>

              <SectionCard
                icon={InfoIcon}
                title="Hours note"
                description="A short note shown alongside your opening hours."
              >
                <TextAreaField
                  id="bp-hours-note"
                  label="Note"
                  value={profile.hours.note}
                  onChange={(value) => patchSection("hours", { note: value })}
                  placeholder="e.g. Closed on public holidays. Timings may change during exams."
                  rows={3}
                  maxLength={500}
                />
              </SectionCard>
            </TabsContent>

            {/* -------------------------------------------- Attributes & media */}
            <TabsContent value="attributes" className="flex flex-col gap-4">
              <SectionCard
                icon={ListChecksIcon}
                title="Attributes"
                description="Help customers know what to expect before they visit."
              >
                <div className="flex flex-col gap-5">
                  {ATTRIBUTE_GROUPS.map((group) => (
                    <CheckGroup
                      key={group.key}
                      title={group.title}
                      options={group.options}
                      selected={profile.attributes[group.key]}
                      onToggle={(option) =>
                        toggleAttribute(group.key, option)
                      }
                    />
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                icon={ImageIcon}
                title="Photos & media"
                description="Paste publicly accessible image URLs. Google recommends a logo, cover photo, and several real photos."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex gap-3">
                    <ImagePreview
                      url={profile.media.logoUrl}
                      label="Logo"
                      className="size-20 shrink-0"
                    />
                    <TextField
                      id="bp-logo"
                      label="Logo URL"
                      type="url"
                      value={profile.media.logoUrl}
                      onChange={(value) =>
                        patchSection("media", { logoUrl: value })
                      }
                      placeholder="https://…/logo.png"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex gap-3">
                    <ImagePreview
                      url={profile.media.coverUrl}
                      label="Cover"
                      className="h-20 w-28 shrink-0"
                    />
                    <TextField
                      id="bp-cover"
                      label="Cover photo URL"
                      type="url"
                      value={profile.media.coverUrl}
                      onChange={(value) =>
                        patchSection("media", { coverUrl: value })
                      }
                      placeholder="https://…/cover.jpg"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <TagInput
                    id="bp-photos"
                    label="Additional photo URLs"
                    value={profile.media.photos}
                    onChange={(value) => patchSection("media", { photos: value })}
                    placeholder="Paste an image URL and press Enter"
                    description="Add photos of your classrooms, team, facilities, or events."
                  />
                  {profile.media.photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {profile.media.photos.map((url) => (
                        <ImagePreview
                          key={url}
                          url={url}
                          label="Photo"
                          className="aspect-square w-full"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <TextField
                    id="bp-video"
                    label="Video URL"
                    type="url"
                    value={profile.media.videoUrl}
                    onChange={(value) =>
                      patchSection("media", { videoUrl: value })
                    }
                    placeholder="https://youtube.com/watch?v=…"
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={MessageSquareIcon}
                title="Internal notes"
                description="Private notes for your team. These are never shown on Google."
              >
                <TextAreaField
                  id="bp-notes"
                  label="Notes"
                  value={profile.notes}
                  onChange={(value) => patch("notes", value)}
                  placeholder="Verification call scheduled, listing manager contact, etc."
                  rows={4}
                  maxLength={2000}
                />
              </SectionCard>
            </TabsContent>
          </Tabs>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Fields marked <span className="text-destructive">*</span> are
              required for a complete listing. Changes are saved to Postgres and
              cached on this device.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={!dirty || saving}
              >
                <RotateCcwIcon className="size-3.5" />
                Reset
              </Button>
              <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
                {saving ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <SaveIcon className="size-3.5" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
