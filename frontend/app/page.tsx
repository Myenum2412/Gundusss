import { cookies } from "next/headers"
import { SESSION_COOKIE } from "@/lib/session-constants"
import { LibreLandingPage } from "@/components/libre-landing-page"

export default function Home() {
  const session = cookies().get(SESSION_COOKIE)?.value
  const isAuthenticated = Boolean(session)

  return <LibreLandingPage isAuthenticated={isAuthenticated} />
}
