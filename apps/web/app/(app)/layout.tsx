import {
  SidebarInset,
  SidebarProvider,
} from "@dev-hoster/ui/components/sidebar"
import type { Metadata } from "next"
import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "13.5rem" } as React.CSSProperties}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset>
        <AppTopbar />
        <main id="main" className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-6xl space-y-5">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
