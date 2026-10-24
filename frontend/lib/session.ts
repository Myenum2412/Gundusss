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
  created_at?: string
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
  writeCookie(token)
}

export function storeUser(user: AuthUser) {
  currentUser = user
}

export function clearSession() {
  currentUser = null
  clearSessionCookie()
}

export function hasSessionCookie(): boolean {
  return Boolean(readCookie(SESSION_COOKIE))
}

/** Synchronous check used by data stores before attempting a write. */
export function canWriteStored(): boolean {
  return can(currentUser, "data:write")
}

// Remove data written by older builds. Appwrite is now the only source of
// truth, so any cached collections or account details must not linger in the
// browser where a different account could read them.
export function clearLegacyLocalData(): void {
  if (!hasWindow()) return
  const keys = [
    "auth_token",
    "auth_user",
    "students",
    "student_groups",
    "fee_structures",
    "receipts",
    "announcements",
    "dropdown_options",
    "business_profile",
  ]
  try {
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // Storage may be blocked; there is nothing else to clean up.
  }
}
