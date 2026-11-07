import type { Metadata } from "next"
import { DeploymentsView } from "@/components/deployments/deployments-view"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Deployments",
  "View every build and deployment for this Dev Host project.",
)

export default async function ProjectDeploymentsPage({
  params,
}: PageProps<"/projects/[slug]/deployments">) {
  const { slug } = await params
  return <DeploymentsView slug={slug} />
}
