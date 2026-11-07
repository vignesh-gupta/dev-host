import type { Metadata } from "next"
import { DashboardView } from "@/components/dashboard/dashboard-view"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Dashboard",
  "See your projects, recent deployments, and build activity in Dev Host.",
)

export default function DashboardPage() {
  return <DashboardView />
}
