import type { Metadata } from "next"
import { DeploymentsView } from "@/components/deployments/deployments-view"
import { PageHeader } from "@/components/page-header"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Deployments",
  "Review build and deployment activity across all of your Dev Host projects.",
)

export default function DeploymentsPage() {
  return (
    <>
      <PageHeader
        title="Deployments"
        description="Every build across all projects, newest first."
      />
      <DeploymentsView />
    </>
  )
}
