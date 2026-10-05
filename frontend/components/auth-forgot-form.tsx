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
import { GalleryVerticalEndIcon } from "lucide-react"

export function AuthForgotForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="/"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <GalleryVerticalEndIcon className="size-4" />
              </div>
              <span className="sr-only">Gundusss</span>
            </a>
            <h1 className="text-xl font-bold">Forgot your password?</h1>
            <FieldDescription>
              Enter your email below and we&apos;ll send you a reset link.
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              required
            />
          </Field>
          <Field>
            <Button type="submit">Send reset link</Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        Remembered your password? <a href="/login">Back to login</a>
      </FieldDescription>
    </div>
  )
}
