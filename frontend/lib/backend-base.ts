/**
 * Base URL the Next.js server routes use to reach the Fastify backend.
 *
 * On Vercel the backend is a separate host, so a loopback address can never
 * work. Prefer an explicit environment override, then fall back to the public
 * production API when deployed, and to localhost during local development.
 */
export function backendBaseUrl(): string {
  const configured =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim()

  if (configured) return configured.replace(/\/+$/, "")

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return "https://api.myenum.in"
  }

  return "http://127.0.0.1:4000"
}
