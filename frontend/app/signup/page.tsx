import { AuthSignupForm } from "@/components/auth-signup-form"
import { AuthShell } from "@/components/auth-shell"

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="Set up your organization and start managing fees in minutes."
    >
      <AuthSignupForm />
    </AuthShell>
  )
}
