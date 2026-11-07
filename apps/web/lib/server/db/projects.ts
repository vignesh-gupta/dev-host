import { db } from "@/prisma/db"
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda"
import {
  createProjectSchema,
  defaultOutputDir,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@/lib/schemas"
import { projectNameFromRepoUrl, slugifyProjectName } from "@/lib/slug"
import {
  isTerminalStatus,
  type Deployment,
  type ProjectWithActive,
} from "@/lib/types"
import { createDeployment } from "@/lib/server/db/deployments"
import {
  toDeployment,
  toProjectWithActive,
  type DeploymentRow,
  type ProjectRow,
} from "@/lib/server/db/mappers"
import { conflict } from "@/lib/server/http"
import { stopBuild } from "@/lib/server/queue-build"
import {
  cacheProject,
  getCachedProject,
  invalidateProjectCache,
} from "@/lib/cache"

export async function deploymentRowsFor(
  projectIds: string[]
): Promise<DeploymentRow[]> {
  if (projectIds.length === 0) return []
  return await db.orm.public.Deployment.where((d) => d.projectId.in(projectIds))
    .orderBy((d) => d.createdAt.desc())
    .all()
}

export function getProjectRow(slug: string): Promise<ProjectRow | null> {
  return db.orm.public.Project.where({ slug }).first()
}

export async function listProjects(): Promise<ProjectWithActive[]> {
  const projects = await db.orm.public.Project.orderBy((p) =>
    p.createdAt.desc()
  ).all()
  const deployments = await deploymentRowsFor(projects.map((p) => p.id))
  return projects.map((p) => toProjectWithActive(p, deployments))
}

export async function getProjectBySlug(
  slug: string
): Promise<ProjectWithActive | null> {
  const cached = await getCachedProject(slug)
  if (cached) return cached

  const project = await getProjectRow(slug)
  if (!project) return null
  const decorated = toProjectWithActive(
    project,
    await deploymentRowsFor([project.id])
  )
  await cacheProject(slug, decorated)
  return decorated
}

async function freeProjectSlug(base: string): Promise<string> {
  let candidate = base
  for (let n = 1; await getProjectRow(candidate); n++) {
    candidate = `${base}-${n}`
  }
  return candidate
}

/** Creates the project, its env vars and the first (queued) deployment. */
export async function createProject(
  rawInput: CreateProjectInput,
  userId: number
): Promise<{ project: ProjectWithActive; deployment: Deployment }> {
  const input = createProjectSchema.parse(rawInput)
  const name = input.name ?? projectNameFromRepoUrl(input.repoUrl)
  const slug = await freeProjectSlug(slugifyProjectName(name))

  const keys = input.envVars.map((v) => v.key)
  if (new Set(keys).size !== keys.length)
    throw conflict("Environment variable keys must be unique")

  const project = await db.transaction(async (tx) => {
    const created = await tx.orm.public.Project.create({
      name,
      slug,
      repoUrl: input.repoUrl,
      branch: input.branch,
      framework: input.framework,
      installCommand: input.installCommand,
      buildCommand: input.buildCommand,
      outputDir: input.outputDir ?? defaultOutputDir(input.framework),
      userId,
      activeDeploymentId: null,
    })
    for (const v of input.envVars) {
      await tx.orm.public.EnvVar.create({
        projectId: created.id,
        key: v.key,
        value: v.value,
        secret: v.secret ?? false,
      })
    }
    return created
  })

  const deployment = await createDeployment(project, {})
  const decorated = (await getProjectBySlug(project.slug))!
  return { project: decorated, deployment }
}

export async function updateProject(
  slug: string,
  patch: UpdateProjectInput
): Promise<ProjectWithActive | null> {
  const row = await getProjectRow(slug)
  if (!row) return null
  if (Object.keys(patch).length > 0) {
    await invalidateProjectCache(slug)
    await db.orm.public.Project.where({ id: row.id }).update(patch)
  }
  return getProjectBySlug(slug)
}

/** Deletes the project, its deployments, env vars and domains (cascade). */
export async function deleteProject(slug: string): Promise<boolean> {
  const row = await getProjectRow(slug)
  if (!row) return false

  // Stop builds that are still running; best effort.
  const deployments = await db.orm.public.Deployment.where({
    projectId: row.id,
  }).all()
  await Promise.allSettled(
    deployments
      .filter((d) => d.taskArn && !isTerminalStatus(toDeployment(d).status))
      .map((d) => stopBuild(d.taskArn!, "Project deleted"))
  )

  const lambdaClient = new LambdaClient({
    endpoint: process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566",
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
  })
  const lambdaDeletes = await Promise.allSettled(
    deployments
      .filter((deployment) => deployment.lambdaArn)
      .map((deployment) =>
        lambdaClient.send(
          new DeleteFunctionCommand({ FunctionName: deployment.lambdaArn! })
        )
      )
  )
  const lambdaFailure = lambdaDeletes.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  )
  if (lambdaFailure) {
    console.error("[projects] could not delete deployment Lambda", lambdaFailure.reason)
    throw new Error("Could not clean up the project's Lambda deployments")
  }

  // Project.activeDeploymentId points at a deployment, so clear it before the
  // cascade removes the deployments.
  await db.transaction(async (tx) => {
    await tx.orm.public.Project.where({ id: row.id }).update({
      activeDeploymentId: null,
    })
    await tx.orm.public.Project.where({ id: row.id }).delete()
  })
  await invalidateProjectCache(slug)
  return true
}
