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
// Persistence
// ---------------------------------------------------------------------------

const TOKEN_KEY = "auth_token"
const USER_KEY = "auth_user"

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

export function getToken(): string | null {
  if (!hasWindow()) return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser(): AuthUser | null {
  if (!hasWindow()) return null
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed?.email || !parsed?.role) return null
    return parsed
  } catch {
    return null
  }
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
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {}
  writeCookie(token)
}

export function storeUser(user: AuthUser) {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {}
}

export function clearSession() {
  if (!hasWindow()) return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
  } catch {}
  clearSessionCookie()
}

export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`))
}

/** Synchronous check used by data stores before attempting a write. */
export function canWriteStored(): boolean {
  return can(getStoredUser(), "data:write")
}
