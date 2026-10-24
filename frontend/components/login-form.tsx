"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import { Loader2Icon, ShieldCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getSetupStatus, login, setup } from "@/lib/auth"
import { clearLegacyLocalData, storeSession } from "@/lib/session"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // Clear data cached by older builds before anyone signs in.
    clearLegacyLocalData()
    let active = true
    getSetupStatus()
      .then((status) => {
        if (active) setNeedsSetup(status.needsSetup)
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not reach the backend. Make sure it is running."
          )
        }
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (needsSetup) {
      if (password.length < 8) {
        setError("Choose a password with at least 8 characters.")
        return
      }
      if (password !== confirm) {
        setError("The passwords do not match.")
        return
      }
    }

    setPending(true)
    try {
      const session = needsSetup
        ? await setup({ name, email, password })
        : await login({ email, password })
      storeSession(session.token, session.user)
      router.replace("/dashboard")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : needsSetup
            ? "Could not create the administrator account."
            : "Invalid email or password"
      )
    } finally {
      setPending(false)
    }
  }

  if (checking) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2Icon className="mr-2 size-4 animate-spin" />
        Preparing sign in…
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={cn("flex flex-col gap-4", className)} {...props}>
      <FieldGroup className="gap-4">
        {needsSetup && (
          <div className="flex items-start gap-2.5 rounded-[10px] border bg-muted/40 px-3 py-2.5">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="text-[13px] leading-snug">
              <p className="font-medium">First-time setup</p>
              <p className="text-muted-foreground">
                No accounts exist yet. Create the first administrator to unlock the app.
              </p>
            </div>
          </div>
        )}

        {needsSetup && (
          <Field>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input
              id="name"
              type="text"
              placeholder="School administrator"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="you@school.org"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            {!needsSetup && (
              <a
                href="/forgot-password"
                className="ml-auto text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </a>
            )}
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            required
            minLength={needsSetup ? 8 : undefined}
            autoComplete={needsSetup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {needsSetup && (
            <FieldDescription>At least 8 characters.</FieldDescription>
          )}
        </Field>

        {needsSetup && (
          <Field>
            <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        )}

        {error && (
          <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <Field>
          <Button type="submit" disabled={pending} className="h-9.5 w-full rounded-[10px] font-medium">
            {pending
              ? needsSetup
                ? "Creating administrator…"
                : "Signing in…"
              : needsSetup
                ? "Create administrator"
                : "Sign in"}
          </Button>
        </Field>

        <p className="text-center text-[13px] text-muted-foreground">
          Accounts are created by an administrator. Ask an admin if you need access.
        </p>
      </FieldGroup>
    </form>
  )
}
