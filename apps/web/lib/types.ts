// Shared entity shapes returned by the API routes. Dates are ISO strings.
// Mirrors apps/web/prisma/contract.prisma, plus a few UI-facing extras.

export const FRAMEWORKS = ["REACT", "VUE", "SVELTE", "STATIC", "NEXT"] as const
export type Framework = (typeof FRAMEWORKS)[number]

export const DEPLOYMENT_STATUSES = [
  "QUEUED",
  "BUILDING",
  "READY",
  "FAILED",
] as const
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

export type DeploymentType = "STATIC" | "SSR"

export const isTerminalStatus = (s: DeploymentStatus) =>
  s === "READY" || s === "FAILED"

export interface User {
  id: number
  email: string | null
  name: string | null
  createdAt: string
  updatedAt: string
}

export interface Deployment {
  id: string
  projectId: string
  slug: string
  commitSha: string | null
  commitMessage: string | null
  branch: string | null
  status: DeploymentStatus
  s3Path: string | null
  deploymentType: DeploymentType
  lambdaUrl: string | null
  lambdaArn: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface Project {
  id: string
  name: string
  slug: string
  repoUrl: string
  branch: string
  framework: Framework
  installCommand: string
  buildCommand: string
  outputDir: string
  userId: number
  activeDeploymentId: string | null
  createdAt: string
  updatedAt: string
}

/** Project as returned by the API: includes the live deployment and public URL. */
export interface ProjectWithActive extends Project {
  activeDeployment: Deployment | null
  latestDeployment: Deployment | null
  url: string
}

/** Deployment as returned by the cross-project API: includes project basics. */
export interface DeploymentWithProject extends Deployment {
  project: Pick<Project, "id" | "name" | "slug">
  isActive: boolean
}

export interface EnvVar {
  id: string
  projectId: string
  key: string
  value: string
  secret: boolean
  createdAt: string
  updatedAt: string
}

export type DomainStatus = "PENDING" | "VERIFIED"

export interface Domain {
  id: string
  projectId: string
  hostname: string
  status: DomainStatus
  createdAt: string
}

export type LogLevel = "info" | "warn" | "error"

export interface LogLine {
  ts: string
  level: LogLevel
  message: string
}

/** Server-sent events on /api/deployments/[id]/logs. */
export type LogEvent =
  | ({ type: "log" } & LogLine)
  | { type: "status"; status: DeploymentStatus }

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    issues?: { path: string; message: string }[]
  }
}

export interface DomainsResponse {
  /** The always-on `<slug>.<preview domain>` host. */
  primary: string
  domains: Domain[]
}
