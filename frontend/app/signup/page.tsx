import { AuthSignupForm } from "@/components/auth-signup-form"
import { AuthShell } from "@/components/auth-shell"

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start managing fees for your school in minutes."
      panelTitle="Onboard a whole school in an afternoon."
      panelSubtitle="Import students, group them by batch, and send fee reminders on WhatsApp."
    >
      <AuthSignupForm />
    </AuthShell>
  )
}
