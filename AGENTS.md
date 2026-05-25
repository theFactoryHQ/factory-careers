# Agent Context

## What This Repo Is

`factory-careers` is Factory's hiring and applicant-tracking system for
`careers.thefactoryhq.com`.

- Public job board and application flows live under `app/pages` and supporting `app/components`.
- Authenticated dashboard surfaces live under `app/pages/dashboard`.
- Nitro API routes, server utilities, database schema, migrations, and scripts live under `server`.
- Shared cross-boundary helpers live under `shared`.
- The authenticated CLI lives under `packages/careers-cli`.
- Unit tests live under `tests/unit`; browser tests live under `e2e`.

## Stack

- Nuxt 4 and Vue 3
- TypeScript
- Nitro server routes
- PostgreSQL with Drizzle ORM
- Better Auth
- Tailwind CSS v4
- Vitest and Playwright
- MinIO/S3-compatible private document storage
- Microsoft and Google calendar integration paths
- Shared `@caffeinebounce/email` package for transactional email rendering

## Product Boundaries

Factory Careers began as an AGPL-compatible Reqcore fork, but it is now its own
Factory operational product. Preserve useful upstream patterns where they fit,
but evaluate product, security, access, deployment, and automation decisions
against Factory's current workflow.

This app owns Factory Careers-specific ATS behavior: jobs, candidates,
applications, source tracking, interviews, organization controls, AI-assisted
recruiting workflows, public job applications, and authenticated CLI automation.

Reusable package behavior belongs in the appropriate shared package. Do not copy
shared-package source into this repo for local tweaks.

## Local Setup

Use the README for full setup details. The short version:

```bash
export NODE_AUTH_TOKEN=ghp_your_github_packages_read_token
npm ci
./setup.sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

In Codex worktrees, a sibling or primary checkout may be the source of truth for
local `.env` and `.env.local` files. Do not commit machine-specific paths or
local secrets to this repo.

## Authenticated CLI

The CLI is the preferred automation surface for agents and operator scripts.

```bash
./packages/careers-cli/bin/factory-careers.mjs --help
./packages/careers-cli/bin/factory-careers.mjs auth status --json
```

Keep CLI behavior deterministic and agent-friendly:

- Support `--json`, `--stdin`, `--yes`, and `--no-input` on automation paths.
- Return structured status, code, and message fields in JSON mode.
- Add CLI parity evidence when API, shared contract, or route behavior changes.
- Keep `docs/CLI.md` aligned with route coverage and intentional exclusions.

## Organization And AI Context

Organization-level defaults belong in organization settings, not hardcoded
server prompts or shared logic. In particular, keep business framing such as
`analysisContext` editable through the organization settings flow and available
to the CLI.

Do not hardcode org-specific business context into shared scoring, parsing, or
chatbot logic when a settings/config/content surface is the correct owner.

## Verification

Run the narrowest useful proof set for the change, then broaden when touching
API contracts, auth, tenant isolation, database schema, CLI coverage, public
applications, or dashboard workflows.

Common checks:

```bash
npm run test:unit
npm run typecheck
npm run build
```

Useful focused checks:

```bash
npm run check:conventions
npm run preflight:cli-parity
./packages/careers-cli/bin/factory-careers.mjs --help
./packages/careers-cli/bin/factory-careers.mjs auth status --json
npm run test:e2e:smoke
```

Run `npm run preflight:pr` before pushing broad changes. It mirrors the required
PR validation path: CLI parity evidence, unit tests, optional lint, typecheck,
CLI smoke tests, production env contract validation, and build.

Browser QA matters for public job flows, application forms, dashboard controls,
settings pages, custom listboxes/menus, responsive layout, and visual polish.
Green unit tests are not enough for visible UX changes.

## Convention Checks

Use `npm run check:conventions` when changing agent instructions, contributor
docs, repo conventions, CLI docs, theme rules, API/shared contracts, or
workflow-sensitive files. This fast check verifies AGENTS/CLAUDE sync, CLI
parity guard wiring, merge-conflict hygiene, theme rules, and agent-facing docs.

This is a focused rules bundle, not a replacement for typecheck, build, e2e, or
runtime browser checks when behavior changes.

## DRY And Reuse

Search for an existing component, composable, helper, or server utility before creating a new one.
Start with `rg` across `app/components`, `app/composables`, `server/utils`, `server/api`, `shared`, and `packages/careers-cli` so new work fits the repo instead of adding a parallel pattern.

Prefer extending or extracting existing pieces over creating one-off variants.
If similar UI, validation, API plumbing, CLI formatting, auth checks, or data
normalization already exists, reuse it directly or create a shared abstraction
near the current owner. Keep abstractions small and grounded in real repeated
behavior.

Treat structural duplication as implementation work. When a DRY pass surfaces
repeated components, copy-pasted request handlers, duplicated form logic, or
parallel state helpers, fix the shared shape or split the cleanup into scoped
follow-up issues rather than leaving only a note.

## Working Rules

- Keep changes scoped to the task. This repo often has active adjacent PRs.
- Check `git status --short` before editing, before staging, and before final handoff.
- Pin GitHub CLI commands with `gh --repo theFactoryHQ/factory-careers ...`.
- Use Nuxt 4 `app/` plus root `server/` structure.
- Use `env` from `server/utils/env.ts` in server code instead of direct `process.env` access.
- For domain data, always scope server queries by `organizationId` from session.
- Preserve tenant isolation and role checks when touching dashboard or API code.
- Prefer typed schemas and structured parsers over ad hoc string manipulation.
- Keep expected negative paths quiet and explicit; validation failures should return useful status codes without noisy production logs.
- Follow [docs/reference/THEME.md](docs/reference/THEME.md) for visual work.
- For UI work, preserve visible focus, Escape behavior, focus return, and keyboard support for custom listbox, menu, combobox, modal, and drawer patterns.
- Do not edit unrelated OpenClaw, agent, machine-level config, or private personality files from this repo.

## Important Areas

- Public jobs and applications: `app/pages/jobs`, `app/pages/apply`, public API routes, upload handling, and application compliance tests.
- Dashboard: `app/pages/dashboard`, `app/components`, `app/composables`, and dashboard-focused unit/e2e coverage.
- Auth and access: Better Auth config, SSO providers, invitation links, join requests, signup domain allowlists, and RBAC helpers.
- AI workflows: `server/utils/ai`, AI config routes, scoring tests, org `analysisContext`, and provider/model catalog behavior.
- CLI: `packages/careers-cli`, `docs/CLI.md`, route coverage manifests, and CLI parity tests.
- Database: `server/database`, Drizzle migrations, and `server/database/migrations/meta/_journal.json`.
- Operations: `render.yaml`, Docker files, production env validation, backup rehearsals, and docs under `docs/operations`.

## Pull Request Hygiene

- Start from a clean branch or worktree when possible.
- Use focused commits with prefixes such as `feat:`, `fix:`, `refactor:`, or `docs:`.
- Agent-generated commits should use `git commit --no-verify`; then run the relevant checks manually.
- Keep DCO requirements in mind for human-authored commits.
- If API/shared contract files change, run `npm run preflight:cli-parity` and include CLI docs or tests as evidence when needed.
- When concurrent schema work exists, check migration numbering and `_journal.json` early to avoid collision churn.
- Before calling a PR ready, verify both code health and visible UX when the change is user-facing.
