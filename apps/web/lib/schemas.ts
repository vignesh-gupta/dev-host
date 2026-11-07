import { z } from "zod"
import { DEPLOYMENT_STATUSES, FRAMEWORKS } from "@/lib/types"

// Request validation shared by the API routes and the client forms.

export const repoUrlSchema = z
  .string()
  .trim()
  .regex(
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/,
    "Enter a valid GitHub repo URL, e.g. https://github.com/user/repo"
  )

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(60, "Max 60 characters")

const branchSchema = z
  .string()
  .trim()
  .min(1, "Branch is required")
  .max(100)
  .regex(/^[\w./-]+$/, "Invalid branch name")

const commandSchema = z.string().trim().max(200)

const outputDirSchema = z
  .string()
  .trim()
  .min(1, "Output directory is required")
  .max(100)
  .regex(/^[\w./-]+$/, "Invalid directory")
  .refine((v) => !v.startsWith("/") && !v.includes(".."), "Must be a relative path")

/** Where each framework writes its static build by default. */
export const defaultOutputDir = (framework: (typeof FRAMEWORKS)[number]) =>
  framework === "NEXT" ? "out" : "dist"

export const envKeySchema = z
  .string()
  .trim()
  .min(1, "Key is required")
  .max(100)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Letters, digits and _ only; no leading digit")

export const envVarInputSchema = z.object({
  key: envKeySchema,
  value: z.string().max(5000),
  secret: z.boolean().default(false),
})

export const createProjectSchema = z.object({
  repoUrl: repoUrlSchema,
  name: nameSchema.optional(),
  branch: branchSchema.default("main"),
  framework: z.enum(FRAMEWORKS).default("REACT"),
  installCommand: commandSchema.default("npm install"),
  buildCommand: commandSchema.default("npm run build"),
  outputDir: outputDirSchema.optional(),
  envVars: z.array(envVarInputSchema).max(50).default([]),
})
export type CreateProjectInput = z.input<typeof createProjectSchema>

export const updateProjectSchema = z
  .object({
    name: nameSchema,
    repoUrl: repoUrlSchema,
    branch: branchSchema,
    framework: z.enum(FRAMEWORKS),
    installCommand: commandSchema,
    buildCommand: commandSchema,
    outputDir: outputDirSchema,
  })
  .partial()
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const createDeploymentSchema = z.object({
  branch: branchSchema.optional(),
  commitSha: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{7,40}$/i, "Invalid commit sha")
    .optional(),
})
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>

export const updateEnvVarSchema = z
  .object({ key: envKeySchema, value: z.string().max(5000), secret: z.boolean() })
  .partial()

export const createDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(
      /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      "Enter a valid domain, e.g. app.example.com"
    ),
})

/** Builder -> web callback (PATCH /api/deployments/[id]/status). */
export const builderStatusSchema = z.object({
  status: z.enum(DEPLOYMENT_STATUSES.filter((s) => s !== "QUEUED") as ["BUILDING", "READY", "FAILED"]),
  s3Path: z.string().optional(),
  // Reported once the repo is cloned.
  commitSha: z.string().max(64).optional(),
  commitMessage: z.string().max(500).optional(),
  deploymentType: z.enum(["STATIC", "SSR"]).optional(),
  lambdaUrl: z.string().url().optional(),
  lambdaArn: z.string().min(1).optional(),
})

export const deploymentsQuerySchema = z.object({
  status: z.enum(DEPLOYMENT_STATUSES).optional(),
  branch: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

// ---- TODO-AUTH: auth form schemas. Used by the (auth) pages today; the API
// routes that consume them are commented out in lib/auth/.
export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})
export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
})
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
