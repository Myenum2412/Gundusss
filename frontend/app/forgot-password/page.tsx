import { AuthForgotForm } from "@/components/auth-forgot-form"
import { AuthShell } from "@/components/auth-shell"

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Recovery"
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a secure reset link."
    >
      <AuthForgotForm />
    </AuthShell>
  )
}
