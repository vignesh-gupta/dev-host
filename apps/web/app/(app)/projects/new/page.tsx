import type { Metadata } from "next"
import { NewProjectForm } from "@/components/projects/new-project-form"
import { PageHeader } from "@/components/page-header"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "New project",
  "Connect a Git repository and configure its first Dev Host deployment.",
)

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="New project"
        description="Paste a repository. The first build starts as soon as you create it."
      />
      <NewProjectForm />
    </>
  )
}
