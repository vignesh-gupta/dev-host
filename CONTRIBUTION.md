# Contributing

Thank you for contributing to Dev Host. Before changing code, read
[GET_STARTED.md](./GET_STARTED.md) to set up the web app, database, Redis,
preview proxy, and builder path you need.

## Before you start

1. Search existing issues and open an issue before substantial work.
2. Describe the problem, expected behavior, and the infrastructure path used
   to reproduce it.
3. Keep credentials, tokens, `.env` files, build output, and generated secrets
   out of commits.

Issues: <https://github.com/vignesh-gupta/dev-hoster/issues>

## Development setup

Fork the repository, clone your fork, and follow
[GET_STARTED.md](./GET_STARTED.md). Use floci for changes that touch the
deployment pipeline unless the issue specifically requires real AWS.

```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/dev-hoster.git
cd dev-hoster
pnpm install
```

Create a focused branch from the default branch:

```bash
git switch main
git pull --ff-only origin main
git switch -c <issue-number>-short-description
```

## Repository map

- [`apps/web`](./apps/web): Next.js control plane, UI, API routes, and Prisma
  contract.
- [`apps/preview`](./apps/preview): Express reverse proxy for deployed sites.
- [`packages/builder-server`](./packages/builder-server): containerized clone,
  build, upload, and callback workflow.
- [`packages/ui`](./packages/ui): shared UI components and styles.
- [`scripts`](./scripts): floci builder and local RDS workflows.
- [`PRODUCT.md`](./PRODUCT.md): product behavior, design, accessibility, and
  voice guidelines.

## Make a change

1. Keep the change scoped to the issue.
2. Follow existing patterns and types before adding a new abstraction.
3. Update directly related documentation, environment examples, and scripts.
4. For UI changes, preserve keyboard access, visible focus, responsive layouts,
   reduced-motion behavior, and status labels that do not rely on color alone.
5. For deployment changes, test both the web callback and builder-side logs.
6. Add or update tests when the affected package has them. The repository
   currently has no root test suite; still run the available checks below.

When adding a shadcn component, use the repository command:

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

## Validate locally

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

For database contract changes, run from `apps/web`:

```bash
pnpm db:emit
pnpm db:update
```

For the preview package:

```bash
cd apps/preview
npm run build
```

For the builder package:

```bash
cd packages/builder-server
npm test
```

If a command cannot be run because local infrastructure is unavailable,
describe that limitation in the pull request and include the checks that did
run.

## Branch, commit, and pull request conventions

Use short, descriptive names:

```text
Branch: <issue-number>-short-description
Commit: [<issue-number>] <type>: describe the change
PR title: [<issue-number>] describe the change
```

Examples:

```text
Branch: 42-fix-builder-callback
Commit: [42] fix: reject invalid builder status callbacks
PR title: [42] Fix builder callback validation
```

Use conventional types such as `feat`, `fix`, `docs`, `refactor`, `test`, and
`chore`. Keep commits focused and explain behavior changes in the pull request.

## Pull request checklist

- [ ] The related issue is linked.
- [ ] The change is limited to the issue’s scope.
- [ ] Documentation and environment examples are updated where needed.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass, or failures are
      explained.
- [ ] UI changes were checked at a narrow viewport and with keyboard navigation.
- [ ] No secrets, `.env` files, generated output, or unrelated formatting
      changes are included.
- [ ] Screenshots or deployment logs are attached when they clarify a UI or
      infrastructure change.

Open the pull request from your fork into the upstream default branch and
respond to review comments. Do not force-push over a reviewer’s work without
discussing it first.

## Keeping a fork current

Add the upstream repository once:

```bash
git remote add upstream https://github.com/vignesh-gupta/dev-hoster.git
```

Update before starting new work:

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
```

## Code of conduct

Please follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) when participating in
issues, discussions, and pull requests.
