import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function AuthLoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  return (
    <form className={cn("flex flex-col gap-5", className)} {...props}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" placeholder="m@example.com" autoComplete="email" required />
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
          <Input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
        </Field>
        <Field className="pt-1">
          <Button type="submit" size="lg" className="w-full">Login</Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
