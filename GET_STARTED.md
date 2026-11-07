# Get Started

Dev Host is a Vercel-like deployment control plane for Git repositories. The
web app creates projects and deployments, the builder runs inside ECS, build
output is stored in S3, and the preview service serves the deployed project
from a subdomain.

This guide covers both supported infrastructure paths:

- **floci**: local AWS-compatible infrastructure for development.
- **AWS**: real AWS services for a shared or production-like environment.

For contribution work, start here before changing code. The contribution
workflow is in [CONTRIBUTION.md](./CONTRIBUTION.md).

## Prerequisites

Install the following:

- Node.js 20 or newer
- pnpm 12 (the repository pins pnpm in `package.json`)
- Git
- Docker
- PostgreSQL and Redis, or managed equivalents
- AWS CLI

For the floci path, also install floci. The builder scripts are Bash scripts,
so use Git Bash, WSL, or another Bash environment on Windows.

## 1. Install the repository

```bash
git clone https://github.com/vignesh-gupta/dev-hoster.git
cd dev-hoster
pnpm install
```

PowerShell users whose execution policy blocks `pnpm.ps1` can use `pnpm.cmd`
instead.

## 2. Choose your infrastructure path

### Option A: floci (recommended for local development)

Start floci with its AWS-compatible endpoint on `http://localhost:4566` and
its ECR endpoint on `localhost:5100`. Confirm that Docker and floci are
running before continuing.

The application expects these local services:

| Service    | Purpose                               | Default                                        |
| ---------- | ------------------------------------- | ---------------------------------------------- |
| PostgreSQL | Prisma application data               | `localhost:7001` when forwarded from floci RDS |
| Redis      | Build logs and live deployment events | Set `REDIS_URL` to your running Redis          |
| S3         | Static build output                   | `http://localhost:4566`                        |
| ECS        | Runs the builder container            | floci ECS                                      |
| ECR        | Stores the builder image              | `localhost:5100`                               |
| Lambda     | Runs SSR/OpenNext deployments         | floci Lambda                                   |

#### Create the local database

1. Create an RDS PostgreSQL instance in the floci UI.
2. Forward its PostgreSQL port to `localhost:7001`.
3. Set `DATABASE_URL` to the forwarded database.

The complete forwarding and verification procedure is in
[scripts/RDS_SETUP.md](./scripts/RDS_SETUP.md). It also covers SSR deployments
through floci Lambda.

#### Configure the web app

```bash
cp apps/web/.env.example apps/web/.env
```

Set at least:

```dotenv
DATABASE_URL="postgresql://root:<password>@localhost:7001/<database>?sslmode=disable"
REDIS_URL="redis://<redis-host>:<redis-port>"
AWS_ACCESS_KEY_ID="test"
AWS_SECRET_ACCESS_KEY="test"
AWS_ENDPOINT_URL="http://localhost:4566"
AWS_REGION="us-east-1"
AWS_BUCKET_NAME="simple-vercel-output"
BUILDER_CALLBACK_TOKEN="test"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

The builder and the web app must use the same Redis URL, bucket name, and
callback token. If the builder runs in Docker, use a hostname reachable from
the container, such as `host.docker.internal`, where appropriate.

Apply the Prisma contract and seed the placeholder user:

```bash
cd apps/web
pnpm db:update
pnpm db:seed
cd ../..
```

#### Build and register the builder

Create the output bucket if it does not already exist:

```bash
aws s3 mb s3://simple-vercel-output \
  --endpoint-url http://localhost:4566 \
  --region us-east-1
```

Build and push the builder image from its package directory:

```bash
cd packages/builder-server
bash ../../scripts/build-update-builder.sh
cd ../..
```

Export the values used by the task definition, then register the task:

```bash
export GIT_PAT_TOKEN="<token-if-private-repositories-are-enabled>"
export REDIS_URL="redis://<redis-host>:<redis-port>"
export WEB_BASE_URL="http://host.docker.internal:3000"
export BUILDER_CALLBACK_TOKEN="test"
export AWS_BUCKET_NAME="simple-vercel-output"
export AWS_ACCOUNT_ID="000000000000"
export LAMBDA_EXECUTION_ROLE_ARN="arn:aws:iam::000000000000:role/local-lambda-role"

bash scripts/register-task.sh
```

`GIT_PAT_TOKEN` is not required for the currently supported public GitHub
repository flow. Never commit a real token to an env file.

The manual task runner is useful for checking the builder independently:

```bash
bash scripts/run-builder-task.sh
```

It uses the sample repository and IDs in the script. Change those values
before using it for a real deployment.

#### Start the application

Run the web app from the repository root:

```bash
pnpm dev
```

Run the preview proxy separately because it is not part of the Turborepo
development task:

```bash
cd apps/preview
cp .env.example .env
npm install
npm run dev
```

For local static deployments, the preview environment should point at the
floci S3 output:

```dotenv
S3_BASE_URL="http://localhost:4566/simple-vercel-output/__outputs/"
LAMBDA_PROXY_ENDPOINT="http://localhost:4566"
```

Open [http://localhost:3000](http://localhost:3000).

### Option B: AWS

The repository does not include Terraform or a one-command AWS provisioner.
Before starting the app, provision and secure these components in your AWS
account:

1. A PostgreSQL database and Redis instance reachable by the web app and
   builder tasks.
2. An S3 bucket for deployment output.
3. An ECR repository containing the image built from
   [packages/builder-server/Dockerfile](./packages/builder-server/Dockerfile).
4. An ECS cluster and task definition using that image.
5. ECS networking with subnets, security groups, and outbound access to Git,
   S3, Redis, and the web callback URL.
6. IAM permissions for ECS to pull the image and for the builder to write S3,
   publish logs, and create Lambda functions for SSR deployments.
7. A Lambda execution role if SSR/OpenNext deployments are enabled.

Configure `apps/web/.env` with real AWS values. At minimum, set:

```dotenv
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
AWS_BUCKET_NAME="<deployment-output-bucket>"
BUILDER_CALLBACK_TOKEN="<long-random-value>"
NEXT_PUBLIC_SITE_URL="https://<web-app-domain>"
ECS_CLUSTER="<ecs-cluster>"
ECS_TASK_DEFINITION="<task-definition-family-or-arn>"
ECS_CONTAINER_NAME="builder-server"
ECS_LAUNCH_TYPE="FARGATE"
ECS_VPC_SUBNETS="<subnet-id>,<subnet-id>"
ECS_SECURITY_GROUPS="<security-group-id>"
```

Leave `AWS_ENDPOINT_URL` unset so the AWS SDK uses real AWS endpoints.
`ECS_VPC_SUBNETS` and `ECS_SECURITY_GROUPS` are required for Fargate
`awsvpc` networking. Make sure `WEB_BASE_URL` in the builder task definition
points to the deployed web app, not localhost.

Build and push the image using your AWS ECR login and repository URL. The
floci-specific `build-update-builder.sh` script is intentionally not an AWS
provisioning script; it logs in to `localhost:5100` and should not be used for
AWS.

Start the web app and preview service using the same commands as the floci
path. For the preview service, set `S3_BASE_URL` to the S3-compatible public
URL or proxy that serves the project output. Set `PREVIEW_DOMAIN` in the web
app to the domain used for project subdomains.

## 3. Use the UI

1. Open `http://localhost:3000` or your deployed web URL.
2. Go to **Projects** and choose **New project**.
3. Enter a public GitHub repository URL, project name, production branch, and
   framework.
4. Expand **Build settings** when the defaults do not match the repository:
   - **Install command**, such as `pnpm install --frozen-lockfile`.
   - **Build command**, such as `pnpm build`.
   - **Output directory**, relative to the repository root, such as `dist`,
     `build`, or `out`.
5. Add build-time variables under **Environment variables**. Mark secrets as
   secret values and do not paste credentials into issue reports.
6. Create the project. Its first deployment is queued automatically.
7. Open the deployment detail page to follow logs and inspect the final
   status.
8. When the deployment is ready, open the project URL:
   `<project-slug>.<PREVIEW_DOMAIN>`.
9. Use **Project settings** to change the branch or build settings, and
   **Domains** to add and verify a custom DNS CNAME.

The supported deployment states are `QUEUED`, `BUILDING`, `READY`, and
`FAILED`. A successful static deployment is served from S3. A server-rendered
deployment is served through a Lambda Function URL.

## Useful commands

From the repository root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm format
```

From `apps/web`:

```bash
pnpm db:emit
pnpm db:update
pnpm db:seed
pnpm db:studio
```

The Prisma contract workflow is documented in the project’s Prisma skill under
[apps/web/.claude/skills/prisma-8](./apps/web/.claude/skills/prisma-8).

## Troubleshooting

- **The web app cannot connect to PostgreSQL:** verify the forwarded port and
  `DATABASE_URL`; then run `Test-NetConnection localhost -Port 7001` on
  Windows.
- **A deployment stays queued:** verify ECS cluster, task definition, and
  `AWS_ENDPOINT_URL`; for floci, rerun the builder image and task registration
  scripts.
- **Build logs do not appear:** verify that the web app and builder share
  `REDIS_URL` and `BUILDER_CALLBACK_TOKEN`.
- **The preview URL is unavailable:** verify `apps/preview` is running,
  `S3_BASE_URL` points to the output bucket, and the project slug is part of
  the hostname.
- **A build cannot clone the repository:** the current UI supports public
  GitHub repositories. If private repository support is enabled, configure
  `GIT_PAT_TOKEN` only in the builder task environment.
