# Dev Host

Dev Host is a Vercel-like deployment control plane for front-end projects.
Register a GitHub repository, choose its build settings, watch an isolated
builder run, and serve the successful output from a project subdomain.

The project is designed to run locally with [floci](https://floci.dev/), an
AWS-compatible local infrastructure environment, and can also target real AWS
services.

## What it does

- Registers public GitHub repositories as projects.
- Builds a selected branch in an ECS builder task.
- Supports static output for React, Vue, Svelte, static sites, and exported
  Next.js projects.
- Supports server-rendered Next.js/OpenNext output through Lambda.
- Stores static output in S3 and serves it through the preview proxy.
- Streams deployment logs through Redis and the web app.
- Tracks `QUEUED`, `BUILDING`, `READY`, and `FAILED` deployment states.
- Supports environment variables, redeploys, rollback/promote actions, and
  custom domain verification.

## Architecture

```text
Browser
  │
  ▼
apps/web ── PostgreSQL
  │  └──── Redis (logs and events)
  │
  └──── ECS task: packages/builder-server
             ├── clone repository
             ├── install and build
             ├── upload static output to S3
             └── deploy SSR output to Lambda when required

apps/preview ── S3 or Lambda Function URL
```

The web app is the control plane. The builder is a separate container, and the
preview service is a separate Node process. This separation is important when
running locally.

## Quick start

For the complete local setup, including PostgreSQL, Redis, floci, the builder
image, and the preview proxy, read
[GET_STARTED.md](./GET_STARTED.md).

The shortest web-only setup is:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
cd apps/web
pnpm db:update
pnpm db:seed
cd ../..
pnpm dev
```

This requires a working PostgreSQL and Redis connection in
`apps/web/.env`. A complete deployment requires the builder and preview
processes described in [GET_STARTED.md](./GET_STARTED.md).

Open [http://localhost:3000](http://localhost:3000), create a project, and
follow its deployment detail page. The current UI accepts public GitHub
repositories.

## Documentation

| Document                                                                 | Use it for                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [GET_STARTED.md](./GET_STARTED.md)                                       | Local floci setup, AWS setup, scripts, UI workflow, and troubleshooting |
| [CONTRIBUTION.md](./CONTRIBUTION.md)                                     | Issue, branch, commit, validation, and pull request workflow            |
| [PRODUCT.md](./PRODUCT.md)                                               | Product behavior, design system, accessibility, and UX voice            |
| [scripts/RDS_SETUP.md](./scripts/RDS_SETUP.md)                           | Forwarding a floci RDS PostgreSQL instance and testing SSR deployments  |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)                               | Community participation expectations                                    |
| [`apps/web/.claude/skills/prisma-8`](./apps/web/.claude/skills/prisma-8) | Prisma 8 contract workflow and database guidance                        |

## Technology

- Next.js 16, React 19, and Tailwind CSS 4
- TypeScript and Turborepo
- Prisma 8 contract workflow with PostgreSQL
- TanStack Query and Zustand
- AWS SDK for ECS, S3, and Lambda
- Redis for deployment logs and events
- Express and `http-proxy` for the preview service
- Docker for the builder image

## Commands

Run from the repository root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm format
```

Run from `apps/web`:

```bash
pnpm db:emit
pnpm db:infer
pnpm db:update
pnpm db:sign
pnpm db:studio
pnpm db:seed
```

Run the preview service separately:

```bash
cd apps/preview
npm install
npm run dev
```

Build and test the builder package separately:

```bash
cd packages/builder-server
npm test
```

The floci builder workflow is in [GET_STARTED.md](./GET_STARTED.md) and uses
the scripts in [`scripts`](./scripts).

## Configuration

Copy the relevant examples before starting:

- [Root `.env.example`](./.env.example): shared AWS and site settings.
- [`apps/web/.env.example`](./apps/web/.env.example): database, Redis, and
  web settings.
- [`apps/preview/.env.example`](./apps/preview/.env.example): S3 and Lambda
  proxy settings.

Do not commit `.env` files, access keys, Git tokens, callback tokens, or
database credentials. For real AWS, leave `AWS_ENDPOINT_URL` unset and use
least-privilege IAM roles or credentials.

## Contributing

Read [CONTRIBUTION.md](./CONTRIBUTION.md) before opening an issue or pull
request. It links back to [GET_STARTED.md](./GET_STARTED.md) so contributors
use the same development and validation path.

## License

No license has been declared in this repository yet. Treat the code as
all-rights-reserved until a project license is added.
