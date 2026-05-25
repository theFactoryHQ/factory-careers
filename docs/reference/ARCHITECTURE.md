# Factory Careers Architecture

Factory Careers is a Nuxt 4 full-stack application with a Vue frontend in `app/`, Nitro API routes in `server/`, shared cross-boundary contracts in `shared/`, and an authenticated CLI package in `packages/careers-cli/`.

## Runtime Shape

| Layer | Current Choice | Notes |
| --- | --- | --- |
| App framework | Nuxt 4, Vue 3, Nitro | SSR app and API routes share one deployable service. |
| Database | PostgreSQL with Drizzle ORM | All hiring data is scoped by organization. |
| Auth | Better Auth with organizations | Factory production uses Microsoft SSO and gated dashboard access. |
| Object storage | S3-compatible storage | Supabase Storage S3 in production, MinIO in local Docker flows. |
| Styling | Tailwind CSS v4 plus shared UI recipes | Factory dashboard chrome uses neutral `--ui-*` tokens. |
| CLI | `@thefactory/careers-cli` | Agent-safe automation surface with JSON and stdin contracts. |

## Deployment

The production target is `careers.thefactoryhq.com` on Render, backed by Supabase Postgres and Supabase Storage S3. Local development can run against host services through `.env` or the Docker compose stack.

## Security Invariants

- Server routes derive `organizationId` from the authenticated session or active membership, never from caller-provided request body data.
- Candidate documents are private objects streamed through authenticated routes.
- Public signup, public organization creation, and dashboard access are controlled by Factory-specific feature flags and SSO policy.
- Mutating CLI commands require authenticated profiles and explicit confirmation unless an automation-safe flag is used.

## Key Paths

| Path | Responsibility |
| --- | --- |
| `app/pages` | Route-level Vue pages. |
| `app/components` | Shared UI components. |
| `server/api` | Nitro API routes. |
| `server/utils` | Auth, DB, storage, email, scoring, and integration helpers. |
| `shared` | Shared schemas, feature flags, permissions, and CLI contracts. |
| `packages/careers-cli` | Authenticated CLI package and command coverage manifest. |
| `tests/unit` | Unit and contract coverage. |
| `e2e` | Playwright acceptance and tenant-isolation checks. |

