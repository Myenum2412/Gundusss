import { apiFetch, readData } from "./api-base"
import type { ProfileInfo } from "./session"

export interface ProfileSummary extends ProfileInfo {
  userCount: number
  super: boolean
}

/** Super-admin only. The backend returns 403 for every other account. */
export async function listProfiles(): Promise<ProfileSummary[]> {
  const res = await apiFetch("/api/profiles")
  return readData<ProfileSummary[]>(res)
}

/** The workspace the current request is operating on. */
export async function getActiveProfile(): Promise<ProfileInfo> {
  const res = await apiFetch("/api/profile")
  return readData<ProfileInfo>(res)
}
