import { API_BASE } from "./api-base"

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

export const WEEKDAYS: { key: Weekday; label: string; short: string }[] = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
]

export interface DayHours {
  open: boolean
  allDay: boolean
  from: string
  to: string
}

export interface SpecialHours {
  id: string
  label: string
  date: string
  closed: boolean
  from: string
  to: string
}

export interface BusinessProfile {
  name: string
  primaryCategory: string
  additionalCategories: string[]
  description: string
  openingDate: string
  businessType: "On-site" | "Online" | "Hybrid"
  labels: string[]
  status: "Open" | "Temporarily closed" | "Permanently closed"

  phone: string
  secondaryPhone: string
  email: string
  website: string
  whatsapp: string
  social: {
    facebook: string
    instagram: string
    x: string
    youtube: string
    linkedin: string
  }

  location: {
    country: string
    state: string
    city: string
    postalCode: string
    addressLine1: string
    addressLine2: string
    locality: string
    serviceArea: boolean
    serviceAreas: string[]
    serviceRadiusKm: string
    latitude: string
    longitude: string
    mapUrl: string
    hideAddress: boolean
  }

  hours: {
    timezone: string
    days: Record<Weekday, DayHours>
    special: SpecialHours[]
    note: string
  }

  attributes: {
    accessibility: string[]
    amenities: string[]
    serviceOptions: string[]
    payments: string[]
    parking: string[]
    highlights: string[]
  }

  media: {
    logoUrl: string
    coverUrl: string
    photos: string[]
    videoUrl: string
  }

  links: {
    appointmentUrl: string
    reservationUrl: string
    orderAheadUrl: string
    menuUrl: string
    placeId: string
    profileUrl: string
    bookingPolicy: string
  }

  messagingEnabled: boolean
  verificationStatus: "Unverified" | "Pending" | "Verified"
  verifiedOn: string
  notes: string
}

const STORAGE_KEY = "business_profile"

function day(open: boolean): DayHours {
  return { open, allDay: false, from: "09:00", to: "18:00" }
}

export function defaultBusinessProfile(): BusinessProfile {
  return {
    name: "Seeds of Success",
    primaryCategory: "",
    additionalCategories: [],
    description: "",
    openingDate: "",
    businessType: "On-site",
    labels: [],
    status: "Open",

    phone: "",
    secondaryPhone: "",
    email: "",
    website: "",
    whatsapp: "",
    social: {
      facebook: "",
      instagram: "",
      x: "",
      youtube: "",
      linkedin: "",
    },

    location: {
      country: "India",
      state: "",
      city: "",
      postalCode: "",
      addressLine1: "",
      addressLine2: "",
      locality: "",
      serviceArea: false,
      serviceAreas: [],
      serviceRadiusKm: "",
      latitude: "",
      longitude: "",
      mapUrl: "",
      hideAddress: false,
    },

    hours: {
      timezone: "Asia/Kolkata",
      days: {
        monday: day(true),
        tuesday: day(true),
        wednesday: day(true),
        thursday: day(true),
        friday: day(true),
        saturday: day(true),
        sunday: day(false),
      },
      special: [],
      note: "",
    },

    attributes: {
      accessibility: [],
      amenities: [],
      serviceOptions: [],
      payments: [],
      parking: [],
      highlights: [],
    },

    media: {
      logoUrl: "",
      coverUrl: "",
      photos: [],
      videoUrl: "",
    },

    links: {
      appointmentUrl: "",
      reservationUrl: "",
      orderAheadUrl: "",
      menuUrl: "",
      placeId: "",
      profileUrl: "",
      bookingPolicy: "",
    },

    messagingEnabled: false,
    verificationStatus: "Unverified",
    verifiedOn: "",
    notes: "",
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Merge stored data on top of the defaults so fields added in a later
 * release always exist, even when an older record is loaded.
 */
function mergeValue<T>(base: T, raw: unknown): T {
  if (Array.isArray(base)) {
    return (Array.isArray(raw) ? raw : base) as T
  }
  if (isObject(base)) {
    if (!isObject(raw)) return base
    const merged: Record<string, unknown> = { ...base }
    for (const key of Object.keys(base)) {
      merged[key] = mergeValue((base as Record<string, unknown>)[key], raw[key])
    }
    return merged as T
  }
  if (typeof raw === typeof base && raw !== null) return raw as T
  return base
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export function normalizeBusinessProfile(raw: unknown): BusinessProfile {
  const merged = mergeValue(defaultBusinessProfile(), raw)
  const rawObject = isObject(raw) ? raw : {}

  merged.additionalCategories = cleanList(merged.additionalCategories)
  merged.labels = cleanList(merged.labels)
  merged.location.serviceAreas = cleanList(merged.location.serviceAreas)
  merged.media.photos = cleanList(merged.media.photos)

  merged.attributes.accessibility = cleanList(merged.attributes.accessibility)
  merged.attributes.amenities = cleanList(merged.attributes.amenities)
  merged.attributes.serviceOptions = cleanList(merged.attributes.serviceOptions)
  merged.attributes.payments = cleanList(merged.attributes.payments)
  merged.attributes.parking = cleanList(merged.attributes.parking)
  merged.attributes.highlights = cleanList(merged.attributes.highlights)

  const rawHours = isObject(rawObject.hours) ? rawObject.hours : {}
  const rawSpecial = Array.isArray(rawHours.special) ? rawHours.special : []
  merged.hours.special = rawSpecial
    .map((entry, index) =>
      mergeValue<SpecialHours>(
        {
          id: `special-${index + 1}`,
          label: "",
          date: "",
          closed: false,
          from: "09:00",
          to: "17:00",
        },
        entry
      )
    )
    .filter((entry) => Boolean(entry.date))

  return merged
}

function loadLocal(): BusinessProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultBusinessProfile()
    return normalizeBusinessProfile(JSON.parse(raw))
  } catch {
    return defaultBusinessProfile()
  }
}

function cacheLocal(profile: BusinessProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage may be full or disabled; the server copy is still attempted.
  }
}

export interface LoadedBusinessProfile {
  profile: BusinessProfile
  updatedAt: string | null
  online: boolean
}

export async function loadBusinessProfile(): Promise<LoadedBusinessProfile> {
  try {
    const res = await fetch(`${API_BASE}/api/business-profile`, {
      cache: "no-store",
    })
    if (!res.ok) throw new Error("Failed to load business profile")
    const json = await res.json()
    const raw = json?.data?.profile
    if (!raw) {
      // No record on the server yet — start from any local draft.
      return { profile: loadLocal(), updatedAt: null, online: true }
    }
    const profile = normalizeBusinessProfile(raw)
    cacheLocal(profile)
    return {
      profile,
      updatedAt: typeof json?.data?.updatedAt === "string" ? json.data.updatedAt : null,
      online: true,
    }
  } catch {
    return { profile: loadLocal(), updatedAt: null, online: false }
  }
}

export interface SaveBusinessProfileResult {
  ok: boolean
  updatedAt: string | null
}

export async function saveBusinessProfile(
  profile: BusinessProfile
): Promise<SaveBusinessProfileResult> {
  // Always keep a local copy, so a temporary backend outage never loses edits.
  cacheLocal(profile)
  try {
    const res = await fetch(`${API_BASE}/api/business-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    })
    if (!res.ok) throw new Error("Failed to save business profile")
    const json = await res.json()
    return {
      ok: true,
      updatedAt: typeof json?.data?.updatedAt === "string" ? json.data.updatedAt : null,
    }
  } catch {
    return { ok: false, updatedAt: null }
  }
}
