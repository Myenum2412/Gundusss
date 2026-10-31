import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./session-constants"

export type Role = "admin" | "accountant" | "viewer"

export type Permission =
  | "data:read"
  | "data:write"
  | "settings:manage"
  | "users:manage"
  | "whatsapp:manage"

export interface AuthUser {
  id: number
  name: string
  email: string
  role: Role
  active: boolean
  /** Workspace this account belongs to. */
  profile_id: string
  /** True only for the fixed developer super admin. */
  super: boolean
  created_at?: string
}

export interface ProfileInfo {
  profileId: string
  name: string
  ownerName: string
  ownerEmail: string
  paymentUrl: string
  createdAt: string
  updatedAt?: string
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  accountant: "Accountant",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access, including users, settings, and every record.",
  accountant: "Can manage students, fees, receipts, and settings. No user management.",
  viewer: "Read-only access to records.",
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "data:read",
    "data:write",
    "settings:manage",
    "users:manage",
    "whatsapp:manage",
  ],
  accountant: [
    "data:read",
    "data:write",
    "settings:manage",
    "whatsapp:manage",
  ],
  viewer: ["data:read"],
}

export const ROLES: Role[] = ["admin", "accountant", "viewer"]

export function roleHasPermission(
  role: Role | undefined | null,
  permission: Permission
): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function can(
  user: AuthUser | null | undefined,
  permission: Permission
): boolean {
  return Boolean(user?.active !== false && roleHasPermission(user?.role, permission))
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------
//
// The signed token lives only in a first-party cookie (a UI gate — the backend
// verifies the token on every API call). The account itself is kept in memory
// for the lifetime of the page. Nothing is written to localStorage, so one
// person's cached app data or account details can never be read by the next
// person who signs in on the same browser.

let currentUser: AuthUser | null = null

/**
 * The workspace a super admin is currently inspecting. This is only a view
 * selection: the backend verifies `super` before honouring it, and regular
 * accounts ignore it entirely.
 */
const ACTIVE_PROFILE_COOKIE = "fees_profile_view"

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!entry) return null
  const raw = entry.slice(name.length + 1)
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function getToken(): string | null {
  return readCookie(SESSION_COOKIE)
}

/** The signed-in account, available only in this browser tab's memory. */
export function getStoredUser(): AuthUser | null {
  return currentUser
}

function writeCookie(token: string) {
  if (!hasWindow()) return
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

export function clearSessionCookie() {
  if (!hasWindow()) return
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function storeSession(token: string, user: AuthUser) {
  currentUser = user
  // Always start in the account's own workspace after a fresh sign-in.
  clearActiveProfileId()
  writeCookie(token)
}

export function storeUser(user: AuthUser) {
  currentUser = user
}

export function clearSession() {
  currentUser = null
  clearSessionCookie()
  clearActiveProfileId()
}

/** Workspace currently being viewed by a super admin, if any. */
export function getActiveProfileId(): string | null {
  return readCookie(ACTIVE_PROFILE_COOKIE)
}

export function setActiveProfileId(profileId: string) {
  if (!hasWindow()) return
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${ACTIVE_PROFILE_COOKIE}=${encodeURIComponent(
    profileId
  )}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

export function clearActiveProfileId() {
  if (!hasWindow()) return
  document.cookie = `${ACTIVE_PROFILE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function hasSessionCookie(): boolean {
  return Boolean(readCookie(SESSION_COOKIE))
}

/** Synchronous check used by data stores before attempting a write. */
export function canWriteStored(): boolean {
  if (currentUser) {
    return can(currentUser, "data:write")
  }
  return hasSessionCookie()
}

// Remove data written by older builds. Appwrite is now the only source of
// truth, so cached collections and account details must not linger in the
// browser where a different account could read them. This also runs on boot
// and on every sign-in so leftover keys from any previous release are purged.
const LEGACY_STORAGE_KEYS = [
  "auth_token",
  "auth_user",
  "token",
  "user",
  "session",
  "profile",
  "profile_id",
  "active_profile",
  "students",
  "student_groups",
  "fee_structures",
  "fees",
  "receipts",
  "announcements",
  "dropdown_options",
  "business_profile",
  "payment_settings",
  "reminder_settings",
  "wa_state",
]

const LEGACY_STORAGE_PREFIXES = [
  "fees_",
  "myfees_",
  "fee_",
  "student",
  "receipt",
  "announcement",
  "dropdown_",
  "business_",
  "auth_",
  "profile_",
  "payment_",
  "youpi_",
]

function isLegacyAppKey(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    LEGACY_STORAGE_KEYS.includes(lower) ||
    LEGACY_STORAGE_PREFIXES.some((prefix) => lower.startsWith(prefix))
  )
}

export function clearLegacyLocalData(): void {
  if (!hasWindow()) return

  try {
    const storage = window.localStorage
    const stale: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && isLegacyAppKey(key)) stale.push(key)
    }
    for (const key of stale) storage.removeItem(key)
    // Remove fixed keys even when enumeration is unavailable.
    for (const key of LEGACY_STORAGE_KEYS) storage.removeItem(key)
  } catch {
    // Storage may be blocked; there is nothing else to clean up.
  }

  // No current code path uses sessionStorage. Clearing it removes any data
  // left by older builds without touching other origins' storage.
  try {
    window.sessionStorage.clear()
  } catch {
    // ignore
  }
}
