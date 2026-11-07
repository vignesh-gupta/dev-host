import type { Metadata } from "next"
import { ProjectsView } from "@/components/projects/projects-view"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Projects",
  "Manage the Git repositories deployed with Dev Host.",
)

export default function ProjectsPage() {
  return <ProjectsView />
}
