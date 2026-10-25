"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signup, type AuthSession } from "@/lib/auth"
import { storeSession } from "@/lib/session"

function CopyButton({
  value,
  label,
  copied,
  onCopy,
}: {
  value: string
  label: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onCopy}
      className="shrink-0"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </Button>
  )
}

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [organization, setOrganization] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [copied, setCopied] = useState<"id" | "url" | null>(null)

  async function copy(value: string, which: "id" | "url") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      setError("Could not copy automatically. Select the text and copy it manually.")
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("The passwords do not match.")
      return
    }

    setPending(true)
    try {
      const created = await signup({
        name: name.trim(),
        organization: organization.trim(),
        email: email.trim(),
        password,
      })
      storeSession(created.token, created.user)
      setSession(created)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your workspace. Please try again."
      )
    } finally {
      setPending(false)
    }
  }

  if (session) {
    const { profile } = session
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2.5 rounded-[10px] border bg-muted/40 px-3 py-2.5">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="text-[13px] leading-snug">
            <p className="font-medium">Your workspace is ready</p>
            <p className="text-muted-foreground">
              Save your profile ID. Every student, fee, receipt, and setting in
              this account belongs only to this workspace.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Profile ID
          </p>
          <div className="flex items-center gap-2 rounded-[10px] border bg-muted/30 px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[15px] font-semibold tracking-tight">
              {profile.profileId}
            </code>
            <CopyButton
              value={profile.profileId}
              label="Copy"
              copied={copied === "id"}
              onCopy={() => void copy(profile.profileId, "id")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Payment link
          </p>
          <div className="flex items-center gap-2 rounded-[10px] border bg-muted/30 px-3 py-2.5">
            <a
              href={profile.paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] font-medium underline underline-offset-4"
            >
              <span className="truncate">{profile.paymentUrl}</span>
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
            <CopyButton
              value={profile.paymentUrl}
              label="Copy"
              copied={copied === "url"}
              onCopy={() => void copy(profile.paymentUrl, "url")}
            />
          </div>
          <FieldDescription>
            Share this link with students or parents so they can reach your
            payment page.
          </FieldDescription>
        </div>

        {error && (
          <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <Button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="h-9.5 w-full rounded-[10px] font-medium"
        >
          Continue to dashboard
          <ArrowRightIcon />
        </Button>

        <p className="text-center text-[13px] text-muted-foreground">
          Keep this ID safe — it is also shown on your Profile page.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input
              id="name"
              type="text"
              placeholder="Ada Lovelace"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="organization">Workspace name</FieldLabel>
            <Input
              id="organization"
              type="text"
              placeholder="MyFees"
              required
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </Field>
        </div>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <Field>
          <Button
            type="submit"
            disabled={pending}
            className="h-9.5 w-full rounded-[10px] font-medium"
          >
            {pending ? (
              <>
                <Loader2Icon className="animate-spin" />
                Creating your workspace…
              </>
            ) : (
              "Create workspace"
            )}
          </Button>
        </Field>

        <p className="text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </a>
        </p>
      </FieldGroup>
    </form>
  )
}
