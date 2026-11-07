# Plan: Next.js SSR Support via OpenNext + Lambda

## Current deployment constraints

- Lambda ZIP deployments are measured by their expanded size: AWS permits 250 MB
  (262,144,000 bytes), even when the ZIP is uploaded through S3.
- The builder prunes source maps, declarations, build caches, compiler binaries,
  documentation/test directories, and image-runtime packages when image
  optimization is not enabled. It logs the measured expanded size before upload.
- Projects with `output: "export"` and a produced `out/` directory remain on the
  S3-only path. Prerendered routes in a normal Next.js build are not by
  themselves a static export; the server path remains required for those builds.
- A package that remains above the ZIP limit must use the planned Lambda
  container-image path rather than more arbitrary file exclusions.

**Approach:** OpenNext + AWS Lambda Function URL + S3 static assets  
**Goal:** Next.js projects using the default server-rendered output or `output: "standalone"` get deployed to Lambda; static projects (React, Vue, Svelte, Next.js `output: "export"`) continue using the existing S3-only path unchanged.

---

## [DONE] Phase 0 — Schema & Type Changes

### Task 0.1 — Add `DeploymentType` enum and `lambdaUrl` to Prisma schema

**File:** `apps/web/prisma/contract.prisma`

Add a new enum to distinguish how a deployment is served:

```prisma
enum DeploymentType {
  STATIC
  SSR
}
```

Add two fields to the `Deployment` model:

```prisma
model Deployment {
  // ... existing fields ...

  deploymentType DeploymentType @default(STATIC)

  // The Lambda Function URL for SSR deployments. Null for static.
  lambdaUrl String?

  // The ARN of the Lambda function, used for cleanup (delete on redeploy/project delete).
  lambdaArn String?
}
```

**After editing:** run `pnpm db:emit` to regenerate `contract.d.ts` / `contract.json`.

### Task 0.2 — Update TypeScript types

**File:** `apps/web/lib/types.ts`

- Add `DeploymentType = "STATIC" | "SSR"` type. (Infer from Prisma enum.)
- Add `deploymentType`, `lambdaUrl`, `lambdaArn` to the `Deployment` interface.

### Task 0.3 — Update mappers

**File:** `apps/web/lib/server/db/mappers.ts`

- Map the new Prisma fields (`deploymentType`, `lambdaUrl`, `lambdaArn`) through to the DTO in `toDeployment()`.

### Task 0.4 — Update deployment status callback schema

**File:** `apps/web/lib/schemas.ts`

The builder's PATCH callback already sends `{ status, s3Path?, commitSha?, commitMessage? }`. Extend it to also accept:

- `deploymentType?: "STATIC" | "SSR"`
- `lambdaUrl?: string`
- `lambdaArn?: string`

### Task 0.5 — Update `updateDeploymentStatus` to persist new fields

**File:** `apps/web/lib/server/db/deployments.ts`

In `updateDeploymentStatus()`, the `extra` parameter already handles `s3Path`, `commitSha`, `commitMessage`. Extend it to also persist `deploymentType`, `lambdaUrl`, `lambdaArn` when status is `READY` and they are present.

### Task 0.6 — Migrate the database

Run `pnpm db:update` to apply the new columns. For existing deployments, the `@default(STATIC)` handles backfill. (Not run during this implementation per request.)

---

## [DONE] Phase 1 — Builder: Detect Framework & Build Mode

The builder needs to know whether a project produces static output or needs SSR. Two signals are available:

1. **`Framework` enum on the Project** — already `NEXT` for Next.js projects.
2. **The actual `next.config.*` in the cloned repo** — the source of truth for `output: "export"` vs server-rendered output.

The Project's `framework` field tells the builder to _look_ for a Next.js config; the config file tells it _what kind_ of build this is.

### Task 1.1 — Pass `framework` to the builder container

**File:** `apps/web/lib/server/queue-build.ts`

Add `{ name: "FRAMEWORK", value: project.framework }` to the `environment` array in `queueBuild()`. The `QueueBuildInput` interface needs a `framework` field.

**File:** `apps/web/lib/server/db/deployments.ts`

In `createDeployment()`, the `project` parameter already has most fields. Ensure `framework` is included in the `Pick<>` type and passed through to `queueBuild()`.

### Task 1.2 — Create framework detection module in builder

**File (new):** `packages/builder-server/lib/frameworkDetector.js`

This module reads the cloned repo and determines the deployment type:

```js
/**
 * Returns { deploymentType: "STATIC" | "SSR", outputDir: string }
 *
 * Logic:
 * 1. If FRAMEWORK env !== "NEXT", return STATIC with the configured OUTPUT_DIR.
 * 2. If FRAMEWORK === "NEXT", find next.config.{js,mjs,ts} in the repo root.
 * 3. Parse/eval the config to extract the `output` field.
 *    - "export" → STATIC, outputDir = "out"
 *    - "standalone" → SSR
 *    - undefined (default) → SSR (Next.js default is server-rendered)
 * 4. If no next.config found, assume SSR (safe default for Next.js).
 */
```

**Parsing strategy for `next.config`:**  
Don't try to `require()` or `import()` it (it may have TypeScript, dependencies, etc.). Instead:

- Use a simple regex / AST-lite approach to find `output:` in the file.
- Look for the string `"export"` or `'export'` near `output`.
- If found → STATIC. Otherwise → SSR.
- This is a heuristic. If it's wrong, the user can override via build settings (future improvement).

### Task 1.3 — Wire detection into the main build script

**File:** `packages/builder-server/script.js`

After `cloneRepo()` and before `runBuild()`:

```js
const { detectDeploymentType } = require("./lib/frameworkDetector")

// After clone, before build:
const detection = detectDeploymentType(outDirPath, {
  framework: process.env.FRAMEWORK,
  configuredOutputDir: OUTPUT_DIR,
})

publishLog(`Deployment type: ${detection.deploymentType}`)
if (detection.deploymentType === "SSR") {
  publishLog("Next.js SSR detected — will package for Lambda after build")
}
```

The detected `deploymentType` and potentially overridden `outputDir` are used in later phases.

---

## [DONE] Phase 2 — Builder: OpenNext Build & Lambda Packaging

When `deploymentType === "SSR"`, the builder runs an additional post-build step to package the output for Lambda.

### Task 2.1 — Install `@opennextjs/aws` in the builder image

**File:** `packages/builder-server/package.json`

Add `@opennextjs/aws` as a dependency. This provides the `open-next build` CLI.

**File:** `packages/builder-server/Dockerfile`

The existing Dockerfile already does `npm ci`. No changes needed as long as the package is in `package.json`. However, ensure the image has enough disk for the OpenNext build output (~500MB for large apps).

### Task 2.2 — Create the OpenNext build step

**File (new):** `packages/builder-server/lib/openNextBuilder.js`

```js
/**
 * Runs `npx open-next build` inside the cloned repo directory.
 *
 * Preconditions:
 * - `npm run build` (or equivalent) has already run successfully.
 * - The repo may have `next.config` with `output: "standalone"`, but this is not required.
 *
 * What it does:
 * 1. Writes a minimal `open-next.config.ts` into the repo root (if not present):
 *    { default: { override: { wrapper: "aws-lambda-streaming" } } }
 * 2. Runs `npx @opennextjs/aws build` in the repo directory.
 * 3. Produces `.open-next/` directory with:
 *    - `.open-next/server-functions/default/` → Lambda handler code
 *    - `.open-next/assets/` → static files for S3
 *
 * Returns: { serverDir: string, assetsDir: string }
 */
```

**Important:** OpenNext expects `next build` to have already run. The existing `runBuild()` handles that. OpenNext is a _post-processing_ step.

### Task 2.3 — Package the Lambda zip

**File (new):** `packages/builder-server/lib/lambdaPackager.js`

```js
/**
 * Creates a zip file from the OpenNext server function output.
 *
 * Input: .open-next/server-functions/default/
 * Output: /tmp/lambda-deployment.zip
 *
 * Uses `archiver` npm package (add to builder's package.json).
 * The zip must include the handler entry point at the root level.
 *
 * Returns: zipFilePath (string)
 */
```

### Task 2.4 — Upload Lambda zip to S3

**File:** `packages/builder-server/lib/uploader.js`

Extend `uploadDist()` or create a separate `uploadLambdaZip()` function:

- Static assets (`.open-next/assets/`) → upload to the same S3 path as today: `__outputs/{projectId}/{deploymentId}/`
- Lambda zip → upload to a separate key: `__lambdas/{projectId}/{deploymentId}/lambda.zip`

The Lambda zip goes to S3 so that the Lambda deployer can reference it by S3 location when creating the function. This avoids sending a 50MB+ zip over the status callback.

### Task 2.5 — Update the main script to orchestrate SSR builds

**File:** `packages/builder-server/script.js`

The updated flow for the main `init()` function:

```
1. Clone repo (unchanged)
2. Detect deployment type (Task 1.3)
3. Run build (unchanged — `npm install && npm run build`)
4. If STATIC:
   a. Upload dist/ to S3 (unchanged)
   b. Callback with { status: "READY", s3Path, deploymentType: "STATIC" }
5. If SSR:
   a. Run OpenNext build (Task 2.2)
   b. Upload static assets to S3 (Task 2.4)
   c. Package Lambda zip (Task 2.3)
   d. Upload Lambda zip to S3 (Task 2.4)
   e. Deploy Lambda function (Task 3 — see next phase)
   f. Callback with { status: "READY", s3Path, deploymentType: "SSR", lambdaUrl, lambdaArn }
```

---

## [DONE] Phase 3 — Lambda Deployer

A new module that creates/updates/deletes Lambda functions. This can live inside the builder (simplest) or as a separate package (cleaner separation). Start inside the builder.

### Task 3.1 — Create Lambda deployer module

**File (new):** `packages/builder-server/lib/lambdaDeployer.js`

```js
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
  DeleteFunctionCommand,
  CreateFunctionUrlConfigCommand,
  waitUntilFunctionActiveV2,
} = require("@aws-sdk/client-lambda")

/**
 * deployLambda({ projectId, deploymentId, s3Bucket, s3Key, role, region })
 *
 * 1. Function name: `devhoster-{projectId}-{deploymentId}` (truncated to 64 chars)
 * 2. Check if function exists (GetFunction). If yes, update code. If no, create.
 * 3. CreateFunctionUrlConfig with AuthType: NONE, InvokeMode: RESPONSE_STREAM
 * 4. Wait for function to be Active.
 * 5. Return { functionArn, functionUrl }
 */
```

**AWS SDK dependency:** Add `@aws-sdk/client-lambda` to `packages/builder-server/package.json`.

### Task 3.2 — IAM role for deployed Lambda functions

The Lambda functions need an execution role. Two approaches:

**Option A (simpler, start here):** A single shared IAM role for all deployed Lambdas. Created once via Terraform. The builder receives its ARN as an environment variable `LAMBDA_EXECUTION_ROLE_ARN`.

**Option B (later):** Per-project roles with scoped S3 access.

### Task 3.3 — Pass Lambda config to the builder

**File:** `apps/web/lib/server/queue-build.ts`

Add new environment variables to the ECS task override:

```js
{ name: "LAMBDA_EXECUTION_ROLE_ARN", value: process.env.LAMBDA_EXECUTION_ROLE_ARN },
{ name: "LAMBDA_S3_BUCKET", value: process.env.AWS_BUCKET_NAME ?? "simple-vercel-output" },
```

These tell the builder where to deploy Lambdas and what IAM role to attach.

### Task 3.4 — Lambda cleanup module

**File (new):** `packages/builder-server/lib/lambdaDeployer.js` (extend)

```js
/**
 * deleteLambda(functionName)
 *
 * Best-effort delete. Called during:
 * - Deployment deletion (web app calls an API, which invokes this)
 * - Project deletion (cascade — delete all deployment Lambdas)
 *
 * Note: This can also be done from the web app side (see Phase 6).
 * Having it in both places provides flexibility.
 */
```

---

## [DONE] Phase 4 — Infrastructure (Terraform)

### Task 4.1 — Lambda execution role for user deployments

**File (new or extend):** `infra/lambda.tf`

```hcl
# IAM role that all deployed Next.js Lambdas assume.
resource "aws_iam_role" "deployed_lambda" {
  name = "${var.name}-deployed-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# Allow the Lambda to log to CloudWatch
resource "aws_iam_role_policy_attachment" "deployed_lambda_logs" {
  role       = aws_iam_role.deployed_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Allow the Lambda to read static assets from S3 (for ISR cache, if needed)
resource "aws_iam_role_policy" "deployed_lambda_s3" {
  name = "s3-read"
  role = aws_iam_role.deployed_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "${aws_s3_bucket.outputs.arn}/*"
    }]
  })
}
```

### Task 4.2 — Grant the builder permission to manage Lambda

**File:** `infra/iam.tf`

The builder's ECS task role needs permissions to:

- `lambda:CreateFunction`
- `lambda:UpdateFunctionCode`
- `lambda:CreateFunctionUrlConfig`
- `lambda:GetFunction`
- `lambda:DeleteFunction`
- `lambda:InvokeFunction` (for warmup, optional)
- `iam:PassRole` on the deployed Lambda role

Add these to the existing `aws_iam_role.builder_task` policy.

### Task 4.3 — Pass `LAMBDA_EXECUTION_ROLE_ARN` to the builder container

**File:** `infra/ecs.tf`

Add to the `environment` block of the builder task definition:

```hcl
{ name = "LAMBDA_EXECUTION_ROLE_ARN", value = aws_iam_role.deployed_lambda.arn }
```

### Task 4.4 — Output the new role ARN

**File:** `infra/outputs.tf`

```hcl
output "lambda_execution_role_arn" {
  value = aws_iam_role.deployed_lambda.arn
}
```

### Task 4.5 — Update `turbo.json` globalEnv

**File:** `turbo.json`

Add `LAMBDA_EXECUTION_ROLE_ARN` to `globalEnv`.

### Task 4.6 — Update `.env.example`

**File:** `.env.example`

Add:

```
LAMBDA_EXECUTION_ROLE_ARN=arn:aws:iam::123456789:role/dev-hoster-deployed-lambda
```

---

## [DONE] Phase 5 — Preview Server: Route SSR vs Static

### Task 5.1 — Extend the `/api/rs/get-live` endpoint

**File:** The API route that the preview server calls (`apps/web/app/api/rs/get-live/route.ts` or similar).

Currently returns `{ id, activeDeploymentId }`. Extend to also return:

- `deploymentType: "STATIC" | "SSR"`
- `lambdaUrl: string | null`

This tells the preview server _how_ to serve this project.

### Task 5.2 — Conditional routing in the preview server

**File:** `apps/preview/src/index.ts`

Currently, every request is proxied to S3. Add a branch:

```ts
const { id: projectId, activeDeploymentId, deploymentType, lambdaUrl } = project

if (deploymentType === "SSR" && lambdaUrl) {
  // Proxy to the Lambda Function URL.
  // Static assets (_next/static/*) can still be served from S3 for performance,
  // but for MVP, proxy everything through Lambda (it handles its own static serving).
  return proxy.web(req, res, { target: lambdaUrl, changeOrigin: true })
}

// Existing static path (unchanged)
const target = `${s3BaseUrl}${projectId}/${activeDeploymentId}/`
return proxy.web(req, res, { target, changeOrigin: true })
```

### Task 5.3 — (Optional, post-MVP) Static asset optimization

Status: not implemented; SSR requests currently all proxy through Lambda.

For better performance, serve `/_next/static/*` requests directly from S3 (they're fingerprinted and immutable). Only SSR/dynamic routes go to Lambda.

```ts
if (deploymentType === "SSR") {
  if (req.url?.startsWith("/_next/static/")) {
    // Serve from S3 — these are immutable, cache-forever assets
    const target = `${s3BaseUrl}${projectId}/${activeDeploymentId}${req.url}`
    return proxy.web(req, res, { target, changeOrigin: true })
  }
  // Everything else → Lambda
  return proxy.web(req, res, { target: lambdaUrl, changeOrigin: true })
}
```

---

## [DONE] Phase 6 — Web App: API & UI Updates

### Task 6.1 — Framework-aware defaults in project creation

**File:** `apps/web/lib/schemas.ts` and the project creation API route.

When a user selects `framework: "NEXT"`, auto-set sensible defaults:

- `buildCommand` → `"npm run build"` (same)
- `outputDir` → `"out"` if they want static export, or leave it unused for SSR (the builder detects automatically)

No breaking changes here — the existing defaults work. The builder handles the rest.

### Task 6.2 — Show deployment type in the UI

**Files:** Components that render deployment details (deployment list, deployment detail page).

- Show a badge: `STATIC` or `SSR` next to the deployment status.
- For SSR deployments, show the Lambda Function URL as a copyable link.

### Task 6.3 — Lambda cleanup on deployment delete

**File:** `apps/web/lib/server/db/deployments.ts` or a new cleanup module.

When a deployment is deleted (if you have that feature, or on project delete cascade):

1. Read `lambdaArn` from the deployment row.
2. If present, call Lambda `DeleteFunction` to clean up.
3. Then delete the DB row.

This requires the **web app** to also have `@aws-sdk/client-lambda` as a dependency (or extract the Lambda deployer into a shared package).

**Alternative:** Create a dedicated API route that the builder's cleanup logic calls, or run cleanup as a background job.

### Task 6.4 — Lambda cleanup on project delete

**File:** The project deletion logic.

On project delete, iterate all deployments, collect `lambdaArn`s, delete them all. Prisma `onDelete: Cascade` handles the DB rows, but Lambda functions are external resources.

### Task 6.5 — Update deployment status callback handler

**File:** `apps/web/app/api/deployments/[deploymentId]/status/route.ts`

The PATCH handler receives the builder's callback. It already calls `updateDeploymentStatus()`. Ensure the new fields (`deploymentType`, `lambdaUrl`, `lambdaArn`) are extracted from the request body and passed through.

---

## [DONE] Phase 7 — Local Development (floci)

### Task 7.1 — Local Lambda emulation

For local development with floci (LocalStack), Lambda and Lambda Function URLs are supported. The builder's `lambdaDeployer.js` already uses `AWS_ENDPOINT_URL` for the Lambda client, so it should work against LocalStack the same way S3 and ECS do.

Verify:

- `AWS_ENDPOINT_URL=http://localhost:4566` is passed to the Lambda client.
- LocalStack Community edition supports `lambda:CreateFunction`, `lambda:CreateFunctionUrlConfig`.

### Task 7.2 — Update local dev scripts

**File:** `scripts/register-task.sh`

Add `LAMBDA_EXECUTION_ROLE_ARN` to the task definition environment variables (using a dummy ARN for local dev, e.g. `arn:aws:iam::000000000000:role/local-lambda-role`).

### Task 7.3 — Update `scripts/rds.md` or add a Lambda testing note

Document how to test SSR deployments locally: deploy a sample Next.js app with either the default Next.js output or `output: "standalone"`, verify Lambda is created in LocalStack, and verify the preview server routes to it.

---

## Task Dependency Graph

```
Phase 0 (Schema)
  ├── 0.1 Prisma schema
  ├── 0.2 TypeScript types
  ├── 0.3 Mappers
  ├── 0.4 Callback schema
  ├── 0.5 updateDeploymentStatus
  └── 0.6 DB migration
        │
Phase 1 (Builder: Detection)  ←── depends on Phase 0
  ├── 1.1 Pass framework to builder
  ├── 1.2 Framework detector module
  └── 1.3 Wire into script.js
        │
Phase 4 (Infra)  ←── can run in parallel with Phase 1
  ├── 4.1 Lambda execution role
  ├── 4.2 Builder IAM permissions
  ├── 4.3 Pass role ARN to builder
  ├── 4.4 Outputs
  ├── 4.5 turbo.json
  └── 4.6 .env.example
        │
Phase 2 (Builder: OpenNext + Package)  ←── depends on Phase 1
  ├── 2.1 Install @opennextjs/aws
  ├── 2.2 OpenNext build step
  ├── 2.3 Lambda zip packager
  ├── 2.4 Upload zip + assets to S3
  └── 2.5 Orchestrate in script.js
        │
Phase 3 (Lambda Deployer)  ←── depends on Phase 2 + Phase 4
  ├── 3.1 Lambda deployer module
  ├── 3.2 IAM role (done in Phase 4)
  ├── 3.3 Pass config to builder
  └── 3.4 Cleanup module
        │
Phase 5 (Preview Server)  ←── depends on Phase 0
  ├── 5.1 Extend get-live API
  ├── 5.2 Conditional routing
  └── 5.3 Static asset optimization (post-MVP)
        │
Phase 6 (Web App UI/API)  ←── depends on Phase 0
  ├── 6.1 Framework-aware defaults
  ├── 6.2 Deployment type badge
  ├── 6.3 Lambda cleanup on delete
  ├── 6.4 Project delete cleanup
  └── 6.5 Status callback handler
        │
Phase 7 (Local Dev)  ←── depends on everything
  ├── 7.1 LocalStack Lambda testing
  ├── 7.2 Update scripts
  └── 7.3 Documentation
```

---

## Implementation Order (Recommended)

| Order | Tasks                                 | Why                                                     |
| ----- | ------------------------------------- | ------------------------------------------------------- |
| 1     | Phase 0 (all)                         | Foundation — everything depends on the schema           |
| 2     | Phase 1 (all) + Phase 4 (in parallel) | Detection is cheap; infra is independent                |
| 3     | Phase 2 (all)                         | OpenNext build integration                              |
| 4     | Phase 3 (all)                         | Lambda deployment — this is the critical new capability |
| 5     | Phase 5.1 + 5.2                       | Preview server routing — makes it work end-to-end       |
| 6     | Phase 6.5 → 6.1 → 6.2                 | API callback first, then UI polish                      |
| 7     | Phase 6.3 + 6.4                       | Cleanup lifecycle                                       |
| 8     | Phase 5.3 + Phase 7                   | Optimization + local dev polish                         |

**First working demo:** After completing through step 5, you can deploy a Next.js SSR app and visit it via `<slug>.host`.

---

## What Does NOT Change

- **Static project flow** — completely untouched. React, Vue, Svelte, and `next export` apps build and serve exactly as before.
- **Build log streaming** — Redis pub/sub works the same; OpenNext build output is just more log lines.
- **Database schema backward compatibility** — `deploymentType` defaults to `STATIC`, `lambdaUrl`/`lambdaArn` are nullable. Existing rows are unaffected.
- **Preview server for static projects** — the `if (deploymentType === "SSR")` branch only activates for SSR deployments.
- **ECS task lifecycle** — builder tasks are still ephemeral. The Lambda is created _by_ the builder, not _as_ the builder.

---

## Risks & Mitigations

| Risk                                                 | Mitigation                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenNext version lags behind Next.js 16              | Pin OpenNext version; test with a reference Next.js app in CI                                         |
| Lambda cold starts (200–800ms)                       | Acceptable for MVP. Add provisioned concurrency config later                                          |
| Lambda zip exceeds 250MB unzipped limit              | OpenNext prunes aggressively; monitor size. Fallback: container image Lambda (10GB limit)             |
| `next.config` parsing heuristic is wrong             | Log the detected type; let user override `deploymentType` in project settings (future)                |
| LocalStack Lambda Function URLs not fully compatible | Test early in Phase 7. Fallback: invoke Lambda directly via SDK instead of Function URL for local dev |
| Lambda function leak (orphaned functions)            | Phase 6.3/6.4 cleanup + periodic reconciliation job (future)                                          |
