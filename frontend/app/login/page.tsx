import { AuthLoginForm } from "@/components/auth-login-form"
import { GalleryVerticalEndIcon } from "lucide-react"

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEndIcon className="size-4" />
            </div>
            Gundusss
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <AuthLoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-600 p-10 text-white">
          <h2 className="text-2xl font-bold">Fees Manager</h2>
          <p className="text-sm text-white/70">
            Next.js frontend → Fastify API → Postgres
          </p>
        </div>
      </div>
    </div>
  )
}
