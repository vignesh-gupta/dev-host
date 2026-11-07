import type { Metadata } from "next"
import { ProjectOverview } from "@/components/projects/project-overview"
import { createPageMetadata } from "@/lib/seo"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params
  return createPageMetadata(
    `Project ${slug}`,
    `View the overview, status, and recent activity for the ${slug} project.`,
  )
}

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params
  return <ProjectOverview slug={slug} />
}
