import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const quickLinks = [
  { title: "All Fees", desc: "View and manage fees", href: "/" },
  { title: "Login", desc: "Login to your account", href: "/login" },
  { title: "Sign up", desc: "Create a new account", href: "/signup" },
  { title: "Forgot password", desc: "Reset your password", href: "/forgot-password" },
]

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">
                    Org Menu
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <h1 className="text-2xl font-bold">Org dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage your organization, fees, and account access.
            </p>
          </div>
          <div className="grid auto-rows-min gap-4 md:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                className="rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:bg-accent"
              >
                <div className="text-sm font-semibold">{link.title}</div>
                <div className="text-sm text-muted-foreground">{link.desc}</div>
              </a>
            ))}
          </div>
          <div className="min-h-[50vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
