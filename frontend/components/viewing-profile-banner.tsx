"use client"

import { useRouter } from "next/navigation"
import { Building2Icon, LogOutIcon } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { clearActiveProfileId } from "@/lib/session"

/**
 * Shown only while the fixed developer account is inspecting another
 * organization's workspace. The backend ignores the view header for every
 * other account, so this is purely an affordance for the super admin.
 */
export function ViewingProfileBanner() {
  const router = useRouter()
  const { user, profile, activeProfile } = useAuth()

  if (!user.super || activeProfile.profileId === profile.profileId) {
    return null
  }

  function exitView() {
    clearActiveProfileId()
    router.push("/orgmenu/dashboard")
    router.refresh()
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-primary/15 bg-primary/5 px-4 py-2 text-[12px]">
      <Building2Icon className="size-3.5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate">
        Viewing{" "}
        <span className="font-semibold text-foreground">
          {activeProfile.name}
        </span>{" "}
        <span className="font-mono text-[11px] text-muted-foreground">
          {activeProfile.profileId}
        </span>
        <span className="hidden text-muted-foreground sm:inline">
          {" "}
          — all data below belongs to this workspace.
        </span>
      </p>
      <Button variant="outline" size="xs" onClick={exitView}>
        <LogOutIcon />
        Exit view
      </Button>
    </div>
  )
}
