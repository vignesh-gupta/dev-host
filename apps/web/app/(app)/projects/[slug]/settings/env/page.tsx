import type { Metadata } from "next"
import { EnvEditor } from "@/components/projects/env-editor"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Environment variables",
  "Manage the environment variables available during this project's builds.",
)

export default async function EnvPage({
  params,
}: PageProps<"/projects/[slug]/settings/env">) {
  const { slug } = await params
  return <EnvEditor slug={slug} />
}
