import type { Metadata } from "next"
import { GeneralSettings } from "@/components/projects/general-settings"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Project settings",
  "Configure the repository, branch, and build settings for this project.",
)

export default async function ProjectSettingsPage({
  params,
}: PageProps<"/projects/[slug]/settings">) {
  const { slug } = await params
  return <GeneralSettings slug={slug} />
}
