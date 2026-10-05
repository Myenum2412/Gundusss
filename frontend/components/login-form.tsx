"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon } from "lucide-react"
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
    <form onSubmit={onSubmit} className={cn("flex flex-col gap-5", className)} {...props}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <a
              href="/forgot-password"
              className="ml-auto text-[13px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot your password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive">{error}</p>
        )}
        <Field className="pt-1">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2Icon data-icon="inline-start" className="animate-spin" /> Logging in…
              </>
            ) : (
              "Login"
            )}
          </Button>
        </Field>
        <p className="text-center text-[13px] text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign up
          </a>
        </p>
      </FieldGroup>
    </form>
  )
}
