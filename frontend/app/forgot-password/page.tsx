import { AuthForgotForm } from "@/components/auth-forgot-form"
import { AuthShell } from "@/components/auth-shell"

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset password" subtitle="Enter your email and we'll send you a reset link.">
      <AuthForgotForm />
    </AuthShell>
  )
}
