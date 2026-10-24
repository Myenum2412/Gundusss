import { redirect } from "next/navigation"

// Public self-registration is disabled: accounts are created by an
// administrator from the Users page.
export default function SignupPage() {
  redirect("/login")
}
