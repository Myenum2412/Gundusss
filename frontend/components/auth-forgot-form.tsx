"use client"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function AuthForgotForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-5", className)} {...props}>
      <form>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              autoComplete="email"
              required
            />
            <FieldDescription>
              Enter your email below and we&apos;ll send you a reset link.
            </FieldDescription>
          </Field>
          <Field className="pt-1">
            <Button type="submit" size="lg" className="w-full">Send reset link</Button>
          </Field>
        </FieldGroup>
      </form>
      <p className="text-center text-[13px] text-muted-foreground">
        Remembered your password?{" "}
        <a href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to login
        </a>
      </p>
    </div>
  )
}
