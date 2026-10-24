import { apiFetch, readBody } from "./api-base"
import type { AuthUser, Permission } from "./session"

export interface AuthSession {
  token: string
  user: AuthUser
  permissions: Permission[]
}

interface AuthResponse {
  data: AuthSession
}

export interface LoginInput {
  email: string
  password: string
}

export interface SetupInput {
  name: string
  email: string
  password: string
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return (await readBody<AuthResponse>(res)).data
}

export async function setup(input: SetupInput): Promise<AuthSession> {
  const res = await apiFetch("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return (await readBody<AuthResponse>(res)).data
}

export async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await apiFetch("/api/auth/setup")
  return (await readBody<{ data: { needsSetup: boolean } }>(res)).data
}

export async function getMe(): Promise<{
  user: AuthUser
  permissions: Permission[]
}> {
  const res = await apiFetch("/api/auth/me")
  return (await readBody<{ data: { user: AuthUser; permissions: Permission[] } }>(res))
    .data
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" })
  } catch {
    // Logout is best-effort; the client always clears its local session.
  }
}
