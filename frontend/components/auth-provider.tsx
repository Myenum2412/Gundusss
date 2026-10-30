"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, ShieldAlertIcon } from "lucide-react"

import { getMe, logout } from "@/lib/auth"
import { ApiError } from "@/lib/api-base"
import {
  can as canWithUser,
  clearLegacyLocalData,
  clearSession,
  getStoredUser,
  hasSessionCookie,
  storeUser,
  type AuthUser,
  type Permission,
  type ProfileInfo,
} from "@/lib/session"

interface AuthContextValue {
  user: AuthUser
  /** The account's home workspace. */
  profile: ProfileInfo
  /** The workspace currently being viewed (differs during a super-admin view). */
  activeProfile: ProfileInfo
  isSuper: boolean
  can: (permission: Permission) => boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>")
  }
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [profile, setProfile] = React.useState<ProfileInfo | null>(null)
  const [activeProfile, setActiveProfile] = React.useState<ProfileInfo | null>(
    null
  )
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const validate = React.useCallback(async () => {
    if (!hasSessionCookie()) {
      clearSession()
      setUser(null)
      router.replace("/login")
      return
    }
    try {
      const result = await getMe()
      setUser(result.user)
      setProfile(result.profile)
      setActiveProfile(result.activeProfile)
      storeUser(result.user)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null)
        setError(err.message)
        clearSession()
        router.replace("/login")
      } else {
        // The backend may be starting up or briefly unreachable. Keep the
        // cookie so the session can be verified again, and never sign the user
        // out on a network blip.
        const cached = getStoredUser()
        if (cached) {
          setUser(cached)
          setError(null)
        } else {
          setUser(null)
          setError(
            err instanceof Error
              ? err.message
              : "Could not verify your session."
          )
        }
      }
    } finally {
      setReady(true)
    }
  }, [router])

  const retry = React.useCallback(() => {
    setError(null)
    setReady(false)
    void validate()
  }, [validate])

  React.useEffect(() => {
    // Remove collections cached by older builds. PostgreSQL is the only source
    // of truth, and no account data may linger in this browser.
    clearLegacyLocalData()
    // No cookie means there is no session to verify.
    if (!hasSessionCookie()) {
      router.replace("/login")
      return
    }
    void validate()
  }, [router, validate])

  // Keep the UI in step with role changes and disabled accounts. The backend
  // cache is 30s, so a minute is enough without adding noticeable traffic.
  React.useEffect(() => {
    if (!ready || !user) return
    const timer = window.setInterval(() => {
      getMe()
        .then((result) => {
          setUser(result.user)
          setProfile(result.profile)
          setActiveProfile(result.activeProfile)
          storeUser(result.user)
        })
        .catch((err) => {
          if (
            err instanceof ApiError &&
            (err.status === 401 || err.status === 403)
          ) {
            clearSession()
            router.replace("/login")
          }
        })
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [ready, user?.id, router])

  const signOut = React.useCallback(async () => {
    await logout()
    clearSession()
    setUser(null)
    setProfile(null)
    setActiveProfile(null)
    router.replace("/login")
  }, [router])

  const value = React.useMemo<AuthContextValue | null>(() => {
    if (!user || !profile || !activeProfile) return null
    return {
      user,
      profile,
      activeProfile,
      isSuper: user.super === true,
      can: (permission: Permission) => canWithUser(user, permission),
      signOut,
      refresh: validate,
    }
  }, [user, profile, activeProfile, signOut, validate])

  if (!ready) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Checking your session…
        </div>
      </div>
    )
  }

  if (!value) {
    return (
      <div className="flex h-svh items-center justify-center bg-background px-6">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <ShieldAlertIcon className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Your session could not be verified.</p>
          <p className="text-[13px] text-muted-foreground">
            {error ?? "Redirecting you to sign in…"}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-[10px] border bg-background px-3 py-1.5 text-[13px] font-medium hover:bg-muted"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
