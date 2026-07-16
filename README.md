# Factory Careers

Factory Careers is Factory's hiring and applicant-tracking system for
`careers.thefactoryhq.com`.

It started as an AGPL-compatible fork of
[Reqcore](https://github.com/reqcore-inc/reqcore), but this repository has
since moved well beyond a thin branding pass. The product now carries
Factory-specific access controls, deployment shape, CLI automation, operational
runbooks, security hardening, AI-assisted recruiting workflows, and a larger
test surface around the Factory Careers experience.

## Current Shape

- **Production app:** `https://careers.thefactoryhq.com`
- **Package name:** `factory-careers`
- **Primary stack:** Nuxt 4, Vue 3, Nitro, PostgreSQL, Drizzle ORM, Better Auth,
  Tailwind CSS, MinIO/S3-compatible storage
- **Deployment target:** Render plus Supabase Postgres and Supabase Storage S3
- **License:** AGPL-3.0, inherited from Reqcore
- **CLI:** authenticated agent and operator interface in the
  [Factory Careers CLI](docs/CLI.md) guide

## Relationship To Reqcore

Factory Careers keeps Reqcore's core ATS foundation: jobs, candidates,
applications, custom application questions, pipeline states, interviews,
private documents, source tracking, and dashboard workflows.

The fork has substantial additional development, including:

- Factory branding across the public job board, dashboard shell, auth views,
  transactional email, and theme.
- Microsoft SSO and invitation/approval-gated dashboard access.
- Public email/password signup and arbitrary organization creation disabled by
  default.
- Factory organization seeding via `npm run db:seed:factory`.
- Factory production configuration for Render, Supabase Postgres, Supabase
  Storage S3, Microsoft calendar integration, and Factory hiring inboxes.
- Authenticated `factory-careers` CLI with JSON output, stdin payload support,
  and deterministic route coverage for external agents.
- AI configuration, scoring, chatbot workflows, resume parsing, source tracking,
  candidate properties, feedback intake, and operational backup rehearsals.
- Layered unit, security, e2e, release, backup, and deployment validation
  workflows.

Factory-specific launch and environment notes live in
[`FACTORY_CAREERS.md`](FACTORY_CAREERS.md).

## Product Capabilities

- **Public job board** with SEO-friendly listings and Factory-branded
  application flows.
- **Job management** for draft, open, closed, and archived roles.
- **Custom application forms** with job-specific questions and file uploads.
- **Candidate and application tracking** with status transitions, quick notes,
  comments, properties, activity history, and timeline views.
- **Pipeline dashboard** for recruiter overview, active jobs, candidate
  progress, AI stats, and recent activity.
- **Interview scheduling** with Microsoft and Google calendar integration paths.
- **Private document storage** through S3-compatible storage; resumes and cover
  letters are authenticated, streamed assets rather than public URLs.
- **Source tracking** for attribution links, link statistics, and application
  source reporting.
- **AI-assisted workflows** for criteria generation, application analysis,
  provider configuration, model catalog refresh, and chatbot support.
- **Organization controls** for SSO providers, invite links, join requests,
  signup domain allowlists, and role-based access.
- **Agent-friendly CLI** for authenticated operations without browser cookies or
  direct database access.

## Local Development

This repo expects Node.js `22.22.x` or a compatible Node 24 LTS release, npm,
Docker, and access to Factory's package registry when installing private
`@caffeinebounce/*` packages.

```bash
export NODE_AUTH_TOKEN=ghp_your_github_packages_read_token
npm ci
./setup.sh
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

`./setup.sh` generates `.env` and exits if one already exists. If you need to
regenerate local secrets, remove `.env` first.

For a local Docker stack with Postgres, MinIO, and the Nuxt app instead:

```bash
export NODE_AUTH_TOKEN=ghp_your_github_packages_read_token
./setup.sh
docker compose up --build
```

The Docker build reads `NODE_AUTH_TOKEN` as a BuildKit secret so npm can install
private `@caffeinebounce/*` packages. The first Docker build can take a few
minutes. The app listens on port `3000`, MinIO's console is available at port
`9001`, and Adminer can be enabled with:

```bash
docker compose --profile tools up
```

The compose services and generated local credentials use Factory Careers naming
so logs and Docker state line up with this repository.

## Environment

Start with [`.env.example`](.env.example). Important Factory-specific variables
include:

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `NUXT_PUBLIC_SITE_URL`
- `NUXT_PUBLIC_MARKETING_URL`
- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_FORCE_PATH_STYLE`
- `S3_SKIP_BUCKET_POLICY`
- `AUTH_MICROSOFT_CLIENT_ID`
- `AUTH_MICROSOFT_CLIENT_SECRET`
- `AUTH_MICROSOFT_TENANT_ID`
- `MICROSOFT_CALENDAR_CLIENT_ID`
- `MICROSOFT_CALENDAR_CLIENT_SECRET`
- `MICROSOFT_CALENDAR_TENANT_ID`
- `FACTORY_CAREERS_HIRING_INBOX`
- `FACTORY_CAREERS_CALENDAR_EMAIL`

Production-oriented Render and Supabase values are summarized in
[`FACTORY_CAREERS.md`](FACTORY_CAREERS.md). Broader operational checks are in
[`docs/operations/PRODUCTION-READINESS.md`](docs/operations/PRODUCTION-READINESS.md),
[`docs/operations/PRODUCTION-RUNBOOK.md`](docs/operations/PRODUCTION-RUNBOOK.md),
and
[`docs/operations/PRODUCTION-DATA-RETENTION.md`](docs/operations/PRODUCTION-DATA-RETENTION.md).

## CLI

The authenticated CLI is the preferred automation surface for agents and
operator scripts:

```bash
./packages/careers-cli/bin/factory-careers.mjs --help
./packages/careers-cli/bin/factory-careers.mjs auth status --json
```

The published package exposes a `factory-careers` binary:

```bash
npm install -g @thefactory/careers-cli
factory-careers --base-url https://careers.thefactoryhq.com auth status --json
```

The CLI supports OAuth device login, profiles, JSON output, explicit
confirmation for mutating commands, stdin JSON payloads, and a server-side
capabilities contract. See [`docs/CLI.md`](docs/CLI.md) for command coverage
and agent usage guidance.

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the Nuxt development server |
| `npm run build` | Build the production app |
| `npm run start` | Run the built Nitro server |
| `npm run db:generate` | Generate Drizzle migrations from schema changes |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Seed demo ATS data |
| `npm run db:seed:factory` | Seed the Factory organization and default role |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run typecheck` | Run Nuxt/Vue type checking |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run preflight:pr` | Run the PR validation preflight |
| `npm run cli:pack` | Dry-run package the CLI workspace |
| `npm run cli:publish` | Publish the CLI workspace |
| `npm run ops:backup-restore-rehearsal` | Rehearse database backup and restore |
| `npm run ops:object-storage-restore-rehearsal` | Rehearse object storage restore |
| `npm run ops:validate-production-env` | Validate production environment shape |

## Testing And Validation

Use the smallest meaningful proof set for the change. Typical local validation:

```bash
npm run test:unit
npm run typecheck
```

For browser-facing changes, run the relevant Playwright pack or the full suite:

```bash
npm run test:e2e
```

The repo also has CI workflows for PR validation, e2e tests, CodeQL, secret
scanning, Docker publish/readme validation, backup restore rehearsal, release
verification, and release automation.

## Project Structure

```text
app/                         Nuxt 4 frontend: pages, layouts, components, composables
server/                      Nitro backend: API routes, utilities, plugins, DB schema
shared/                      Shared flags and cross-boundary helpers
packages/careers-cli/        Authenticated Factory Careers CLI package
docs/                        Operator and CLI documentation
e2e/                         Playwright tests
tests/                       Vitest unit and contract tests
scripts/                     Validation, setup, migration, and ops scripts
public/                      Static assets
i18n/                        Locale files and i18n configuration
```

## Documentation Map

- [`FACTORY_CAREERS.md`](FACTORY_CAREERS.md): Factory-specific fork and launch
  notes.
- [`docs/CLI.md`](docs/CLI.md): CLI install, auth, command coverage, JSON
  contract, and portal parity rules.
- [`docs/reference/ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md): Current
  Factory Careers architecture.
- [`docs/reference/PRODUCT.md`](docs/reference/PRODUCT.md): Factory Careers
  product brief.
- [`docs/reference/ROADMAP.md`](docs/reference/ROADMAP.md): Current roadmap.
- [`docs/reference/VERSIONING.md`](docs/reference/VERSIONING.md): Factory release
  identity and semantic versioning policy.
- [`SELF-HOSTING.md`](SELF-HOSTING.md): Docker-based self-hosting guidance for
  Factory Careers.
- [`SECURITY.md`](SECURITY.md): Security policy and supported reporting path.
- [`docs/reference/TESTING-SECURITY.md`](docs/reference/TESTING-SECURITY.md):
  Security test evidence map.
- [`docs/reference/THEME.md`](docs/reference/THEME.md): Theme and visual system
  contract.
- [`docs/reference/I18N.md`](docs/reference/I18N.md): Nuxt i18n notes.
- [`docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md`](docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md):
  Production launch approval checklist.

## GitHub Workflow Notes

This repository lives at `theFactoryHQ/factory-careers`. When using the GitHub
CLI from local worktrees, pin the repo explicitly:

```bash
gh --repo theFactoryHQ/factory-careers ...
```

This avoids accidentally targeting the upstream Reqcore repository from a forked
or reused checkout.

## Upstream And License

Factory Careers remains AGPL-3.0 software. See [`LICENSE`](LICENSE).

Where practical, upstream Reqcore improvements should remain easy to audit, but
Factory Careers is now its own operational product. Product decisions, runtime
configuration, and automation should be evaluated against Factory's deployment
and recruiting workflows first.
