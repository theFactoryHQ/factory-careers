# Plan 011: Separate instance administration from tenant ownership

> **Executor instructions**: Execute from a fresh
> `codex/instance-administration-boundary` branch based on `origin/main`. Run
> every verification gate. Stop and report on any STOP condition. Update this
> plan's status row when finished unless the reviewer owns the index.
>
> **Drift check (run first)**:
> `git diff --stat 88f7c18..HEAD -- server/api/updates server/utils/env.ts shared/permissions.ts app/pages/dashboard/updates.vue tests/unit .env.example docs CHANGELOG.md`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `88f7c18`, 2026-08-23

## Why this matters

The update and backup endpoints perform host-global operations but authorize
them with an organization-scoped permission. Every tenant owner receives
`organization:delete`, so an owner in any organization can attempt a full
database backup or deployment restart. Host administration needs an explicit,
default-deny identity boundary independent of tenant RBAC.

## Current state

- `server/api/updates/apply.post.ts:28-29` calls
  `requirePermission(event, { organization: ['delete'] })`, then runs `git pull`
  and `docker compose up` at lines 70-101.
- `server/api/updates/backup.post.ts:22-24` uses the same tenant permission
  before running instance-wide `pg_dump`.
- `shared/permissions.ts:61-64` grants every organization owner
  `organization:delete`.
- `server/api/updates/system.get.ts` already supplies the settings page's
  system-information contract and is the preferred place to expose a sanitized
  `canAdministerInstance` boolean.
- Follow route authorization test structure from
  `tests/unit/compliance-summary-authorization.test.ts:35-66`.
- Server code must read configuration through `server/utils/env.ts`, never
  direct `process.env` access.

## Target authorization contract

- Introduce `FACTORY_INSTANCE_ADMIN_USER_IDS`, a comma-separated allowlist of
  stable Better Auth user IDs. Trim values, discard empty entries, and expose a
  parsed immutable set through `env` or a dedicated helper.
- Empty or missing configuration means no user can invoke host mutations.
- A helper `requireInstanceAdmin(event)` must call `requireAuth(event)`, compare
  `session.user.id` against the allowlist using exact matching, and return 403
  without revealing configured IDs.
- Organization roles must not grant or imply instance administration.
- `GET /api/updates/system` may remain available under its current auth rule,
  but must return `canAdministerInstance` so the UI hides host actions for other
  users. The server remains authoritative.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `npm run test:unit -- tests/unit/instance-administration.test.ts tests/unit/production-env-validation.test.ts tests/unit/factory-updates-identity.test.ts` | all pass |
| CLI parity | `npm run preflight:cli-parity` | exit 0 |
| Conventions | `npm run check:conventions` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build` | exit 0 |
| Full unit suite | `npm run test:unit` | exit 0 |

## Scope

**In scope**:

- `server/utils/instanceAdmin.ts` (create)
- `server/utils/env.ts`
- `server/api/updates/apply.post.ts`
- `server/api/updates/backup.post.ts`
- `server/api/updates/system.get.ts`
- `app/pages/dashboard/updates.vue`
- `.env.example`
- `docs/operations/PRODUCTION-RUNBOOK.md`
- `docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md`
- `tests/unit/instance-administration.test.ts` (create)
- existing env/update contract tests only where required
- `CHANGELOG.md`

**Out of scope**:

- Changing organization roles or `shared/permissions.ts`.
- Building a database-backed instance-role management UI.
- Altering update, backup, or restore implementation details.
- Email-address authorization or domain-based authorization.
- Publishing configuration values to client runtime config.

## Git workflow

- Branch: `codex/instance-administration-boundary`
- Commit: `fix: separate instance administration from tenant roles`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the default-deny instance-admin helper

Implement exact user-ID parsing and `requireInstanceAdmin(event)`. Export a
pure predicate for tests. Log only a stable denial result code; never log the
allowlist or other credentials.

**Verify**: focused tests prove missing config denies, unrelated tenant owners
are denied, exact allowed IDs pass, whitespace is normalized, and partial/case-
changed IDs fail.

### Step 2: Protect host-global mutation routes

Replace organization permission checks in update and backup routes with
`requireInstanceAdmin`. Do not weaken existing Docker/runtime checks. Add route
tests proving authorization completes before filesystem, child-process, or
database work starts.

**Verify**: focused tests show a 403 path performs zero host side effects and an
allowed user reaches the existing handler logic.

### Step 3: Align the settings UI and system contract

Return `canAdministerInstance` from the authenticated system endpoint. Hide or
disable update and backup actions in `updates.vue` when false, with concise copy
that host administration is unavailable for the account. Do not rely on the UI
for security.

**Verify**: add contract assertions for both boolean states, then run typecheck.

### Step 4: Document bootstrap and rollout

Add the variable to `.env.example` without a real identifier. Document how an
operator obtains the stable Better Auth user ID from an authenticated,
authorized administrative readback. State that an empty value disables host
mutations. Add production rollout steps: configure one operator, deploy, verify
that operator, verify a tenant owner receives 403, then add further operators.
Add a changelog entry.

**Verify**: conventions, production env tests, full unit tests, typecheck, and
build all exit 0.

## Test plan

- Pure parser/predicate tests for empty, multiple, whitespace, exact, and
  nonmatching IDs.
- Route tests import real handlers with mocked auth and assert denial precedes
  `execFile`, filesystem, or backup work.
- System contract tests cover `canAdministerInstance` true and false.
- UI contract test verifies host controls depend on the server-provided flag.

## Done criteria

- [ ] No host-global mutation route authorizes through organization RBAC.
- [ ] Missing configuration fails closed.
- [ ] Tenant owners without explicit instance IDs receive 403.
- [ ] The UI accurately reflects the server capability.
- [ ] No configured identifiers reach logs or public runtime config.
- [ ] Focused tests, CLI parity, conventions, typecheck, build, and full unit tests pass.
- [ ] `git diff --check` exits 0 and only in-scope files changed.

## STOP conditions

- Better Auth user IDs are not stable across the supported deployment lifecycle.
- A supported deployment cannot identify its initial operator without direct database mutation.
- The system endpoint's response is a versioned public contract that cannot add a field compatibly.
- The change appears to require organization-role changes.

## Maintenance notes

Any future host-global operation—restore, migration control, secrets rotation,
or worker administration—must use this boundary. Reviewers should treat a
fallback to tenant ownership, email matching, or configured domains as a
security regression.
