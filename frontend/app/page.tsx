"use client"

import { LoginForm } from "@/components/login-form"
import { AuthShell } from "@/components/auth-shell"

export default function Home() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Login to your account"
      subtitle="Access students, receipts, structures, and WhatsApp outreach in one calm workspace."
    >
      <LoginForm />
    </AuthShell>
  )
}
