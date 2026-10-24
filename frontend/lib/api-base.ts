import { clearSession, getActiveProfileId, getToken } from "./session"

// The backend runs on port 4000. Derive its host from the page host so the app
// works whether it was opened via localhost, 127.0.0.1, or a LAN address.
// "localhost" is mapped to 127.0.0.1 because the backend listens on IPv4 and
// some browsers try ::1 first.
const configured = process.env.NEXT_PUBLIC_API_URL?.trim()

function resolveApiBase(): string {
  if (configured && configured.length > 0) {
    return configured.replace(/\/+$/, "")
  }
  if (typeof window === "undefined") return "http://127.0.0.1:4000"

  const pageHost = window.location.hostname
  const apiHost =
    pageHost === "localhost" || pageHost === "::1" || pageHost === "[::1]"
      ? "127.0.0.1"
      : pageHost

  return `${window.location.protocol}//${apiHost}:4000`
}

export const API_BASE = resolveApiBase()

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

function isAuthEndpoint(path: string): boolean {
  return (
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/setup") ||
    path.startsWith("/api/auth/logout")
  )
}

/**
 * Fetch wrapper that attaches the signed session token to every API call and
 * sends the user back to /login when the session has expired or been revoked.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  // Super admins can inspect another workspace. The header is always sent when
  // a view is selected; the backend ignores it unless the caller is `super`.
  const activeProfileId = getActiveProfileId()
  if (activeProfileId && !path.startsWith("/api/profiles")) {
    headers.set("X-Profile-Id", activeProfileId)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  })

  if (res.status === 401 && !isAuthEndpoint(path)) {
    clearSession()
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login")
    }
  }

  return res
}

/** Read the `{ data }` envelope the backend uses. */
export async function readData<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as {
    data?: T
    error?: string
    message?: string
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError("Your session has expired. Please sign in again.", 401)
    }
    if (res.status === 403) {
      throw new ApiError(
        json.error ?? "You do not have permission to perform this action.",
        403
      )
    }
    throw new ApiError(
      json.error ?? json.message ?? `Request failed (HTTP ${res.status})`,
      res.status
    )
  }
  return json.data as T
}

/** Read the `{ data }` envelope, returning the whole body (for auth routes). */
export async function readBody<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string
    message?: string
  }
  if (!res.ok) {
    throw new ApiError(
      (json as { error?: string }).error ??
        (json as { message?: string }).message ??
        `Request failed (HTTP ${res.status})`,
      res.status
    )
  }
  return json
}
