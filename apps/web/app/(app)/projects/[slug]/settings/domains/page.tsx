import type { Metadata } from "next"
import { DomainsManager } from "@/components/projects/domains-manager"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Domains",
  "Connect and verify custom domains for this Dev Host project.",
)

export default async function DomainsPage({
  params,
}: PageProps<"/projects/[slug]/settings/domains">) {
  const { slug } = await params
  return <DomainsManager slug={slug} />
}
