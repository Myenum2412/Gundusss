"use client"

import { LoginForm } from "@/components/login-form"
import { AuthShell } from "@/components/auth-shell"

export default function Home() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage students, fees, and receipts.">
      <LoginForm />
    </AuthShell>
  )
}
