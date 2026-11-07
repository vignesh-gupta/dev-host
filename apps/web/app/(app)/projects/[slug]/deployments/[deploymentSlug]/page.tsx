import type { Metadata } from "next"
import { DeploymentDetail } from "@/components/deployments/deployment-detail"
import { createPageMetadata } from "@/lib/seo"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[slug]/deployments/[deploymentSlug]">): Promise<Metadata> {
  const { deploymentSlug } = await params
  return createPageMetadata(
    `Deployment ${deploymentSlug}`,
    `Inspect the build status, logs, and details for deployment ${deploymentSlug}.`,
  )
}

export default async function DeploymentPage({
  params,
}: PageProps<"/projects/[slug]/deployments/[deploymentSlug]">) {
  const { slug, deploymentSlug } = await params
  return <DeploymentDetail slug={slug} deploymentSlug={deploymentSlug} />
}
