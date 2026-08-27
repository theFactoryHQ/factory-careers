# Plan 012: Require every PostgreSQL integration suite in PR CI

> **Executor instructions**: Work from a fresh
> `codex/required-postgres-integration` branch based on `origin/main`. Run each
> verification command and stop on a STOP condition. Update the plan index when
> finished unless directed otherwise.
>
> **Drift check (run first)**:
> `git diff --stat 88f7c18..HEAD -- package.json '.github/workflows/pr-validation.yml' tests/integration tests/unit/application-notification-ci.test.ts`

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `88f7c18`, 2026-08-23

## Why this matters

PR CI provisions PostgreSQL but explicitly runs only the two notification/email
integration suites. Five other suites select `describe.skip` when their URL is
absent, so queue concurrency, pipeline pagination, property filters, scoring
run selection, and SSO-secret migration can lose their strongest proof while
the required job stays green.

## Current state

- `.github/workflows/pr-validation.yml:72-87` provisions a PostgreSQL admin URL,
  rehearses migrations, runs unit tests, then explicitly runs only notification
  integration tests.
- The uncovered suites are:
  - `tests/integration/application-current-analysis-run.pg.test.ts`
  - `tests/integration/job-pipeline.pg.test.ts`
  - `tests/integration/processing-queue.pg.test.ts`
  - `tests/integration/property-filters.pg.test.ts`
  - `tests/integration/sso-provider-secrets.pg.test.ts`
- Each currently derives `describeWithPostgres` from an optional URL.
- The established required-mode pattern is in
  `tests/integration/application-notifications.pg.test.ts:11-18` and is
  validated by `tests/unit/application-notification-ci.test.ts`.

## Target contract

- Add one script named `test:integration:postgres-core` that runs exactly the
  five uncovered files.
- Use one shared variable, `FACTORY_CORE_PG_TEST_URL`, as the preferred admin
  URL in all five suites while retaining their existing variables as backwards-
  compatible fallbacks.
- Add `FACTORY_CORE_PG_REQUIRED=true`. When true and no URL is present, each
  suite must throw during module initialization with a clear message instead of
  registering skipped tests.
- CI must pass the already-provisioned local PostgreSQL admin URL and required
  flag to the new script in a separately named required step.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| CI contract test | `npm run test:unit -- tests/unit/application-notification-ci.test.ts` | all tests pass |
| Core integration | `FACTORY_CORE_PG_TEST_URL="$DATABASE_MIGRATION_URL" FACTORY_CORE_PG_REQUIRED=true npm run test:integration:postgres-core` | all five suites run; zero skipped |
| Missing URL proof | `env -u FACTORY_CORE_PG_TEST_URL FACTORY_CORE_PG_REQUIRED=true npm run test:integration:postgres-core` | nonzero with the documented missing-URL message |
| Full unit suite | `npm run test:unit` | exit 0 |
| Lint | `npm run lint` | exit 0 |

The executor must substitute an actual local PostgreSQL admin URL for
`$DATABASE_MIGRATION_URL`; do not place credentials in the plan, commit, or
test output.

## Scope

**In scope**:

- `package.json`
- `.github/workflows/pr-validation.yml`
- the five uncovered `tests/integration/*.pg.test.ts` files listed above
- `tests/unit/application-notification-ci.test.ts`

**Out of scope**:

- Changing database schemas, migrations, or application behavior.
- Combining the seven integration suites into one database.
- Changing the notification/email integration step.
- Changing the GitHub runner type or PostgreSQL provisioning action.

## Git workflow

- Branch: `codex/required-postgres-integration`
- Commit: `ci: require core PostgreSQL integration suites`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Standardize required-mode admission

In each uncovered suite, prefer `FACTORY_CORE_PG_TEST_URL`, retain current URL
fallbacks, and throw a suite-specific clear error when required mode is true but
no URL exists. Preserve optional skipping for ordinary local `npm run test:unit`.

**Verify**: the missing-URL command exits nonzero and names
`FACTORY_CORE_PG_TEST_URL`; a normal unit run without required mode still exits
0 with the same optional skips as before.

### Step 2: Add one deterministic script

Add `test:integration:postgres-core` listing the five files explicitly. Do not
use a broad glob that could silently absorb a new suite with incompatible
environment needs.

**Verify**: `npm run test:integration:postgres-core -- --reporter=verbose` with
the configured URL reports all five suite names and no skipped tests.

### Step 3: Make the script a required PR step

Add a named workflow step immediately after the notification PostgreSQL step.
Pass the same provisioned admin URL as `FACTORY_CORE_PG_TEST_URL` and set
`FACTORY_CORE_PG_REQUIRED: "true"`. Extend the CI contract test to assert the
script contents, workflow step, URL, flag, and required-mode failures.

**Verify**: focused CI contract test, lint, and full unit tests exit 0.

## Test plan

- Contract test asserts the script lists each uncovered suite exactly once.
- Contract test asserts PR workflow invokes the script with required mode.
- Each suite has a required-mode missing-URL assertion or shared helper test.
- Execute all five against real PostgreSQL and record zero skipped tests.

## Done criteria

- [ ] Every PostgreSQL integration suite is either in the existing notification step or the new core step.
- [ ] Required CI cannot turn the five suites into skips.
- [ ] The new real-PostgreSQL run reports zero skipped suites.
- [ ] Unit tests remain usable without a local PostgreSQL server.
- [ ] Focused contract tests, lint, and full unit tests pass.
- [ ] `git diff --check` exits 0 and only in-scope files changed.

## STOP conditions

- Any suite cannot safely use the same admin PostgreSQL instance while creating isolated databases.
- The runner cannot complete the added suites within the existing job timeout.
- A suite mutates the shared `postgres` database instead of a unique temporary database.
- CI changes require exposing a secret value in committed workflow text.

## Maintenance notes

When a new `tests/integration/*.pg.test.ts` file is added, reviewers must place
it in a required script or document a deliberate exclusion. Prefer extending a
machine-checkable inventory test over relying on reviewer memory.
