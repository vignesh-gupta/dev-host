import { getProjectBySlug } from "@/lib/server/data"
import { handle, notFound, ok, parseQuery } from "@/lib/server/http"
import { z } from "zod"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { slug } = parseQuery(request, z.object({ slug: z.string().min(1) }))
    const project = await getProjectBySlug(slug)
    if (!project) throw notFound("Project")

    return ok({
      id: project.id,
      activeDeploymentId: project.activeDeploymentId,
      deploymentType: project.activeDeployment?.deploymentType ?? "STATIC",
      lambdaUrl: project.activeDeployment?.lambdaUrl ?? null,
    })
  })
}