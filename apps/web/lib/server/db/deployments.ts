import { Temporal } from "temporal-polyfill"
import { randomBytes } from "node:crypto"
import { db } from "@/prisma/db"
import type { CreateDeploymentInput } from "@/lib/schemas"
import { deploymentSlug } from "@/lib/slug"
import {
  isTerminalStatus,
  type Deployment,
  type DeploymentStatus,
  type DeploymentWithProject,
} from "@/lib/types"
import { listEnvVarRows } from "@/lib/server/db/env-vars"
import {
  toDeployment,
  type DeploymentRow,
  type ProjectRow,
} from "@/lib/server/db/mappers"
import { publishEvent } from "@/lib/server/logs"
import { refreshProjectCacheById } from "@/lib/cache"
import { queueBuild, stopBuild } from "@/lib/server/queue-build"
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda"

export async function getDeploymentById(
  id: string
): Promise<Deployment | null> {
  const row = await db.orm.public.Deployment.where({ id }).first()
  return row ? toDeployment(row) : null
}

export async function getDeploymentBySlug(
  projectId: string,
  slug: string
): Promise<Deployment | null> {
  const row = await db.orm.public.Deployment.where({ projectId, slug }).first()
  return row ? toDeployment(row) : null
}

export async function listDeployments(
  filter: {
    projectId?: string
    status?: DeploymentStatus
    branch?: string
    limit?: number
  } = {}
): Promise<DeploymentWithProject[]> {
  let query = db.orm.public.Deployment.orderBy((d) => d.createdAt.desc())
  if (filter.projectId) query = query.where({ projectId: filter.projectId })
  if (filter.status) query = query.where({ status: filter.status })
  if (filter.branch) query = query.where({ branch: filter.branch })
  if (filter.limit) query = query.limit(filter.limit)
  const rows: DeploymentRow[] = await query.all()

  const projectIds = [...new Set(rows.map((r) => r.projectId))]
  const projects =
    projectIds.length === 0
      ? []
      : await db.orm.public.Project.where((p) => p.id.in(projectIds)).all()
  const byId = new Map(projects.map((p) => [p.id, p]))

  return rows.flatMap((row) => {
    const project = byId.get(row.projectId)
    return project
      ? [
          {
            ...toDeployment(row),
            project: { id: project.id, name: project.name, slug: project.slug },
            isActive: project.activeDeploymentId === row.id,
          },
        ]
      : []
  })
}

async function freeDeploymentSlug(projectId: string, sha: string) {
  const taken = new Set(
    (await db.orm.public.Deployment.where({ projectId }).all()).map(
      (d) => d.slug
    )
  )
  return deploymentSlug(sha, (s) => taken.has(s))
}

/** Best effort: a Redis outage must not break the request that triggered it. */
async function logSafely(deploymentId: string, message: string) {
  try {
    await publishEvent(deploymentId, { type: "log", message })
  } catch (err) {
    console.error("[logs] could not publish", err)
  }
}

/** Creates a QUEUED deployment and starts the builder container for it. */
export async function createDeployment(
  project: Pick<
    ProjectRow,
    | "id"
    | "slug"
    | "framework"
    | "repoUrl"
    | "branch"
    | "installCommand"
    | "buildCommand"
    | "outputDir"
  >,
  input: CreateDeploymentInput
): Promise<Deployment> {
  const slug = await freeDeploymentSlug(
    project.id,
    input.commitSha ?? randomBytes(20).toString("hex")
  )
  const row = await db.orm.public.Deployment.create({
    projectId: project.id,
    slug,
    commitSha: input.commitSha ?? null,
    branch: input.branch ?? project.branch,
    status: "QUEUED",
  })

  try {
    const taskArn = await queueBuild({
      projectId: project.id,
      projectSlug: project.slug,
      framework: project.framework,
      deploymentId: row.id,
      repoUrl: project.repoUrl,
      branch: row.branch ?? project.branch,
      commitSha: input.commitSha ?? null,
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      outputDir: project.outputDir,
      envVars: (await listEnvVarRows(project.id)).map((e) => ({
        key: e.key,
        value: e.value,
      })),
    })
    await db.orm.public.Deployment.where({ id: row.id }).update({ taskArn })
  } catch (err) {
    console.error("[deployments] failed to queue build", err)
    await logSafely(
      row.id,
      `Error: could not start the build (${err instanceof Error ? err.message : String(err)})`
    )
    await updateDeploymentStatus(row.id, "FAILED")
  }

  return (await getDeploymentById(row.id)) ?? toDeployment(row)
}

/**
 * Applies a status transition reported by the builder (or by cancel/queue
 * failures). Only READY flips Project.activeDeploymentId.
 */
export async function updateDeploymentStatus(
  id: string,
  status: DeploymentStatus,
  extra: {
    s3Path?: string
    commitSha?: string
    commitMessage?: string
    deploymentType?: "STATIC" | "SSR"
    lambdaUrl?: string
    lambdaArn?: string
  } = {}
): Promise<Deployment | null> {
  const existing = await db.orm.public.Deployment.where({ id }).first()
  if (!existing) return null
  // A late BUILDING callback must not resurrect a deployment that already finished.
  if (isTerminalStatus(existing.status) && !isTerminalStatus(status)) {
    return toDeployment(existing)
  }

  const now = Temporal.Now.instant()
  const update = {
    status,
    ...(status === "BUILDING" && !existing.startedAt ? { startedAt: now } : {}),
    ...(isTerminalStatus(status) ? { finishedAt: now } : {}),
    ...(status === "READY" && extra.s3Path ? { s3Path: extra.s3Path } : {}),
    ...(status === "READY" && extra.deploymentType
      ? { deploymentType: extra.deploymentType }
      : {}),
    ...(status === "READY" && extra.lambdaUrl
      ? { lambdaUrl: extra.lambdaUrl }
      : {}),
    ...(status === "READY" && extra.lambdaArn
      ? { lambdaArn: extra.lambdaArn }
      : {}),
    ...(extra.commitSha ? { commitSha: extra.commitSha } : {}),
    ...(extra.commitMessage ? { commitMessage: extra.commitMessage } : {}),
  }

  await db.transaction(async (tx) => {
    await tx.orm.public.Deployment.where({ id }).update(update)
    if (status === "READY") {
      await tx.orm.public.Project.where({ id: existing.projectId }).update({
        activeDeploymentId: id,
      })
    }
  })
  if (status === "READY") {
    await refreshProjectCacheById(existing.projectId)
  }
  return getDeploymentById(id)
}

/** Rollback / promote: make an already-built deployment the live one. */
export async function promoteDeployment(
  deployment: Deployment
): Promise<boolean> {
  if (deployment.status !== "READY") return false
  await db.orm.public.Project.where({ id: deployment.projectId }).update({
    activeDeploymentId: deployment.id,
  })
  await refreshProjectCacheById(deployment.projectId)
  return true
}

/** Stops a QUEUED / BUILDING deployment and marks it FAILED. */
export async function cancelDeployment(
  deployment: Deployment
): Promise<Deployment | null> {
  if (isTerminalStatus(deployment.status)) return deployment

  const row = await db.orm.public.Deployment.where({
    id: deployment.id,
  }).first()
  if (row?.taskArn) {
    try {
      await stopBuild(row.taskArn)
    } catch (err) {
      console.error("[deployments] could not stop task", err)
    }
  }
  await logSafely(deployment.id, "Error: build canceled by user")
  const updated = await updateDeploymentStatus(deployment.id, "FAILED")
  // The builder is gone, so tell any open log stream the build has ended.
  try {
    await publishEvent(deployment.id, { type: "status", status: "FAILED" })
  } catch (err) {
    console.error("[logs] could not publish", err)
  }
  return updated
}

/** Deletes a deployment and its external Lambda, if one was created. */
export async function deleteDeployment(id: string): Promise<boolean> {
  const row = await db.orm.public.Deployment.where({ id }).first()
  if (!row) return false

  if (row.taskArn && !isTerminalStatus(toDeployment(row).status)) {
    await stopBuild(row.taskArn, "Deployment deleted")
  }

  if (row.lambdaArn) {
    const lambda = new LambdaClient({
      endpoint: process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566",
      region: process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
      },
    })
    await lambda.send(
      new DeleteFunctionCommand({ FunctionName: row.lambdaArn })
    )
  }

  await db.transaction(async (tx) => {
    const project = await tx.orm.public.Project.where({
      id: row.projectId,
    }).first()
    if (project?.activeDeploymentId === id) {
      await tx.orm.public.Project.where({ id: row.projectId }).update({
        activeDeploymentId: null,
      })
    }
    await tx.orm.public.Deployment.where({ id }).delete()
  })
  await refreshProjectCacheById(row.projectId)
  return true
}
