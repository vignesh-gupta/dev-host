# Product

## Register

product

## Users

Developers who deploy their own front-end projects. Today it is a single user (user 0, no auth); the shape of the app should not assume that forever. They arrive with a task: register a Git repo, trigger a deploy, watch the build, and confirm the site is live. They often leave a deploy running in a side pane and glance back at it, so status has to read at a glance.

## Product Purpose

A Vercel-like "dev host": each project is a Git repo, each deploy builds it in a container, uploads `dist/` to S3, and serves it on `<slug>.host`. The UI is the control plane for projects, deployments, build logs, environment variables and domains. Success is a developer going from "paste a repo URL" to "visiting the live site" without reading docs, and being able to trust what the status badges say.

## Brand Personality

Technical, calm, dense. Voice is plain and exact: names things by what the user controls, states what happened and what to do next. Orange is the single accent; it marks primary actions and live activity. Edges are sharp, controls are compact, and monospace is used for the things that are code (slugs, commit SHAs, logs, env keys).

## Anti-references

- A Vercel-black clone: no near-black-and-white monochrome as the whole identity.
- Generic AI-SaaS: gradient hero metrics, identical icon-card grids, glassmorphism, purple gradients, decorative eyebrows.
- Rounded, airy consumer-app spacing. This is a dense tool.
- Colour-only status. Every state carries a label and an icon.

## Design Principles

1. **Status is the interface.** QUEUED, BUILDING, READY and FAILED are the product's vocabulary; they look the same everywhere and are readable in a glance and without colour.
2. **Density with rhythm.** Compact rows and controls, but clear grouping and consistent spacing so dense never means cramped.
3. **One accent, used for meaning.** Orange means "act here" or "happening now". Everything else is a warm neutral.
4. **Familiar before clever.** Standard tables, tabs, sidebar and forms. Motion exists to show state change, never to decorate.
5. **Code looks like code.** Slugs, SHAs, env keys and logs are monospace and copyable; logs behave like a terminal (follow, wrap, timestamps).

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 body contrast in both themes, full keyboard operation, visible focus rings, `prefers-reduced-motion` respected, and status never conveyed by colour alone. Touch targets stay usable on mobile widths even though density is high on desktop.
