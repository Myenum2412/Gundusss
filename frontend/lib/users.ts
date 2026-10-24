import { apiFetch, readData } from "./api-base"
import type { AuthUser, Role } from "./session"

export interface CreateUserInput {
  name?: string
  email: string
  password: string
  role: Role
}

export interface UpdateUserInput {
  name?: string
  role?: Role
  active?: boolean
  password?: string
}

export async function getUsers(): Promise<AuthUser[]> {
  const res = await apiFetch("/api/users")
  return readData<AuthUser[]>(res)
}

export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  const res = await apiFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readData<AuthUser>(res)
}

export async function updateUser(
  id: number,
  input: UpdateUserInput
): Promise<AuthUser> {
  const res = await apiFetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readData<AuthUser>(res)
}

export async function deleteUser(id: number): Promise<void> {
  const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(json.error ?? "Could not delete the user.")
  }
}
