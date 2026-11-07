import type { Scalars } from "@prisma/orm-postgres/family-contract/types"
import type { models } from "@/prisma/contract.d"
import type {
  Deployment,
  Domain,
  EnvVar,
  Project,
  ProjectWithActive,
  User,
} from "@/lib/types"
import { projectUrl } from "@/lib/server/config"

export type ProjectRow = Scalars<typeof models.public.Project>
export type DeploymentRow = Scalars<typeof models.public.Deployment>
export type EnvVarRow = Scalars<typeof models.public.EnvVar>
export type DomainRow = Scalars<typeof models.public.Domain>
export type UserRow = Scalars<typeof models.public.User>

// startedAt / finishedAt come back as Temporal.Instant; the API speaks ISO strings.
const iso = (v: { toString(): string } | null | undefined) =>
  v ? v.toString() : null

export const toProject = (p: ProjectRow): Project => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  repoUrl: p.repoUrl,
  branch: p.branch,
  framework: p.framework,
  installCommand: p.installCommand,
  buildCommand: p.buildCommand,
  outputDir: p.outputDir,
  userId: p.userId,
  activeDeploymentId: p.activeDeploymentId,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

export const toDeployment = (d: DeploymentRow): Deployment => ({
  id: d.id,
  projectId: d.projectId,
  slug: d.slug,
  commitSha: d.commitSha,
  commitMessage: d.commitMessage,
  branch: d.branch,
  status: d.status,
  s3Path: d.s3Path,
  deploymentType: d.deploymentType,
  lambdaUrl: d.lambdaUrl,
  lambdaArn: d.lambdaArn,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  startedAt: iso(d.startedAt),
  finishedAt: iso(d.finishedAt),
})

/** Attaches the live and latest deployment plus the public URL. */
export function toProjectWithActive(
  project: ProjectRow,
  deployments: DeploymentRow[]
): ProjectWithActive {
  const mine = deployments
    .filter((d) => d.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const active = mine.find((d) => d.id === project.activeDeploymentId)
  return {
    ...toProject(project),
    activeDeployment: active ? toDeployment(active) : null,
    latestDeployment: mine[0] ? toDeployment(mine[0]) : null,
    url: projectUrl(project.slug),
  }
}

export const toEnvVar = (e: EnvVarRow): EnvVar => ({
  id: e.id,
  projectId: e.projectId,
  key: e.key,
  value: e.value,
  secret: e.secret,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
})

export const toDomain = (d: DomainRow): Domain => ({
  id: d.id,
  projectId: d.projectId,
  hostname: d.hostname,
  status: d.status,
  createdAt: d.createdAt,
})

export const toUser = (u: UserRow): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
})
