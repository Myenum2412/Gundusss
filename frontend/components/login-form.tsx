"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { login } from "@/lib/api"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setPending(true)
    try {
      const user = await login({ email, password })
      try {
        localStorage.setItem("auth_user", JSON.stringify(user))
      } catch {}
      router.push("/dashboard")
    } catch (err: any) {
      setError(err?.message ?? "Invalid email or password")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn("flex flex-col gap-4", className)} {...props}>
      <FieldGroup className="gap-4">
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
            <a
              href="/forgot-password"
              className="ml-auto text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <Field>
          <Button type="submit" disabled={pending} className="h-9.5 w-full rounded-[10px] font-medium">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </Field>
        <p className="text-center text-[13px] text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </a>
        </p>
      </FieldGroup>
    </form>
  )
}
