import type { NextRequest } from "next/server"
import { deleteDeployment } from "@/lib/server/data"
import { handle, noContent, notFound } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ deploymentId: string }> }
) {
  return handle(async () => {
    const { deploymentId } = await ctx.params
    if (!(await deleteDeployment(deploymentId))) {
      throw notFound("Deployment")
    }
    return noContent()
  })
}
