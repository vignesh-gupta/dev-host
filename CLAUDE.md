# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGENTS.md warns that the Next.js version here (16.x) has breaking changes from what you may know; it says to read `node_modules/next/dist/docs/` before writing Next code (run `pnpm install` first — the directory is absent until deps are installed).

## What this is

A Vercel-like "dev host": users register a Git repo as a Project, each deploy builds the repo (branch or exact commit) in an ECS task, uploads the build output to S3, and a reverse proxy serves it by subdomain. Infra is emulated locally with **floci** (LocalStack-style AWS at `http://localhost:4566`, ECR at `localhost:5100`). The MVP targets static output (React, Vue, Svelte, static sites, and Next.js via `output: "export"`).

pnpm + Turborepo monorepo (Node >=20, pnpm 10).

## Commands

Run from the repo root (via turbo): `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format`. There is no test suite.

In `apps/web`: `pnpm db:emit` (regenerate Prisma contract), `db:infer`, `db:update` (apply the contract to the database), `db:sign`, `db:studio`, `db:seed` (needs `.env` with `DATABASE_URL`; copy `.env.example`). `db:emit` is offline, so types can be regenerated and `tsc` run without a database.

Add shadcn components: `pnpm dlx shadcn@latest add <name> -c apps/web` (lands in `packages/ui/src/components`, imported as `@dev-hoster/ui/components/<name>`).

`apps/preview` and `packages/builder-server` are not part of the turbo graph's scripts in practice: preview has its own `dev`/`build`/`start` (`tsx watch --env-file=.env src/index.ts`) and builder-server is plain CommonJS JS with its own npm lockfile and Dockerfile.

Local builder workflow (`scripts/`): `build-update-builder.sh` builds and pushes the builder image to the floci ECR; `register-task.sh` registers the `builder-server-task` ECS task definition (env: `GIT_PAT_TOKEN`, `REDIS_URL`, `WEB_BASE_URL`, `BUILDER_CALLBACK_TOKEN`, ...); `run-builder-task.sh` triggers a manual run; `rds.md` explains exposing the floci RDS Postgres on localhost via a socat container.

## Architecture

Deployment pipeline spanning three packages:

1. **`apps/web`** (Next.js App Router, React 19, Tailwind 4) — landing page at `/`, dashboard under `/dashboard` and `/projects`, and the REST API. Routes: `(marketing)` landing, `(app)` sidebar shell, `(auth)` sign-in/up pages (live, enforcement is commented and labelled `TODO-AUTH`; all rows belong to user 0).
2. **`packages/builder-server`** (runs inside the ECS container) — `script.js` orchestrates: clone the repo at `GIT_BRANCH` (and check out `GIT_COMMIT_SHA` when set; `lib/git.js`) → run `INSTALL_COMMAND` / `BUILD_COMMAND` with `BUILD_ENV_JSON` in the environment (`lib/buildRunner.js`; untouched npm defaults follow the repo's lockfile) → upload `OUTPUT_DIR` to S3 (`lib/uploader.js`). Every log/status event is appended to the Redis list `logs-history:<deploymentId>` and published on `logs:<deploymentId>` (`lib/config.js`, which also masks the Git token and env values). Status goes back to the web app by `PATCH /api/deployments/[id]/status` with the `x-builder-token` header (`BUILDER_CALLBACK_TOKEN`; `lib/deploymentStatus.js`), including the resolved commit SHA and message.
3. **`apps/preview`** (Express + http-proxy) — maps `<subdomain>.host` to `${S3_BASE_URL}/<subdomain>` and serves `index.html` for `/`.

### Web app layers

- **API routes** (`app/api/**`) are the only way the UI reads or writes data, so a CLI can use the same endpoints. Each route wraps its work in `handle()` from `lib/server/http.ts` and returns `{ error: { code, message, issues } }` on failure. Request bodies are validated with the zod schemas in `lib/schemas.ts`, which the client forms share.
- **Data layer** (`lib/server/`): routes import only from `lib/server/data.ts`, which re-exports `db/projects|deployments|env-vars|domains|users` (Prisma ORM), `logs.ts` (Redis), and `config.ts`. `db/mappers.ts` turns Prisma rows (Temporal timestamps) into the DTOs in `lib/types.ts` and masks secret env values. `queue-build.ts` does the ECS `RunTask` / `StopTask`; cluster, task, launch type and subnets come from `ECS_*` env vars (defaults target floci). Custom domains are verified with a real DNS CNAME lookup.
- **Client**: TanStack Query hooks in `lib/api/hooks.ts` over the fetch client in `lib/api/client.ts` (polling while a build is active), zustand UI store in `lib/stores` (persisted, hydrated in Providers). The build log viewer consumes the SSE route `app/api/deployments/[deploymentId]/logs`, which subscribes to Redis first, replays `logs-history`, then streams live events and closes on a terminal status.
- **Design**: `PRODUCT.md` holds the product register (technical, calm, dense; sharp corners; orange accent; WCAG AA; status is always icon + label). The landing page (`components/landing`) is the brand register and uses a CSS-3D isometric scene.

Status flow: `QUEUED` → `BUILDING` → `READY`/`FAILED`. Only a `READY` callback (or a promote/rollback) sets `Project.activeDeploymentId`; a late non-terminal callback never overrides a finished deployment.

**Database**: Prisma 8 pre-release ("contract" workflow) — schema is `apps/web/prisma/contract.prisma` (User, Project, Deployment, EnvVar, Domain); after editing it, run `pnpm db:emit` to regenerate `contract.d.ts`/`contract.json` (both committed). Queries use the ORM-style client from `prisma/db.ts` (`db.orm.public.<Model>.where(...)`, `db.transaction`) and `temporal-polyfill` for timestamps — not the classic `PrismaClient`. Row types come from `Scalars<typeof models.public.<Model>>` in `lib/server/db/mappers.ts`. Prisma skills live in `apps/web/.claude/skills` and match the installed `@prisma/orm-postgres` version; the CLI toolchain (`@prisma/orm-toolchain`) must be the same version as `@prisma/orm-postgres`, otherwise `contract emit` fails with `PSL_DEFAULT_TYPE_INCOMPATIBLE`. `User` is a placeholder; all rows default to user id 0 seeded by `prisma/seed.ts`.

**Shared packages**: `packages/ui` (shadcn components + `globals.css`), `packages/eslint-config`, `packages/typescript-config`. Web imports the `@/` alias for its own root.

Turbo `globalEnv` lists the env vars the system relies on (`DATABASE_URL`, `REDIS_URL`, `PREVIEW_DOMAIN`, `AWS_*`, `ECS_*`, `BUILDER_CALLBACK_TOKEN`); add new ones there so turbo cache/env passthrough works.
