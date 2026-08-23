# Plan 013: Cover every critical Playwright spec in required CI

> **Executor instructions**: Execute from a fresh
> `codex/critical-playwright-coverage` branch based on `origin/main`. Run every
> gate and stop on a STOP condition. Update the index status when complete.
>
> **Drift check (run first)**:
> `git diff --stat 88f7c18..HEAD -- package.json '.github/workflows/e2e-tests.yml' e2e/critical-flows tests/unit/e2e-harness-contract.test.ts`

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `88f7c18`, 2026-08-23

## Why this matters

The required E2E aggregate waits on named package-script packs rather than the
full Playwright discovery command. Two critical-flow specs are in no required
pack: timezone stability for public job dates and complete-result dashboard
pagination. Both can regress while required browser CI stays green.

## Current state

- `e2e/critical-flows/public-job-date-timezones.spec.ts:4` tests UTC, Pacific,
  and Eastern rendering plus hydration errors.
- `e2e/critical-flows/dashboard-list-pagination.spec.ts:8` creates more than one
  page of candidates/applications and tests pagination, search, filtering,
  sorting, responsive behavior, and browser errors.
- `package.json` enumerates required E2E scripts, but neither path appears.
- `.github/workflows/e2e-tests.yml:1381-1385` gates on 18 named jobs that invoke
  those scripts.
- `tests/unit/e2e-harness-contract.test.ts` already reads package scripts and
  workflow job blocks; extend this file rather than creating another source-
  inventory test.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Harness contract | `npm run test:unit -- tests/unit/e2e-harness-contract.test.ts` | all pass |
| Date browser test | `npx playwright test e2e/critical-flows/public-job-date-timezones.spec.ts` | 1 test passes |
| Pagination browser test | `npx playwright test e2e/critical-flows/dashboard-list-pagination.spec.ts` | 1 test passes |
| Full unit suite | `npm run test:unit` | exit 0 |
| Conventions | `npm run check:conventions` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `tests/unit/e2e-harness-contract.test.ts`
- `.github/workflows/e2e-tests.yml` only if an existing job cannot invoke the
  chosen script without a workflow change

**Out of scope**:

- Modifying either uncovered Playwright spec's behavior or fixtures.
- Combining or reducing the 18 E2E jobs.
- Changing Playwright retries, workers, timeouts, or runner infrastructure.
- Adding new browser coverage unrelated to the two uncovered specs.

## Git workflow

- Branch: `codex/critical-playwright-coverage`
- Commit: `ci: cover all critical Playwright flows`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add each spec to the closest existing required pack

Append `public-job-date-timezones.spec.ts` to `test:e2e:job-lifecycle` because it
creates and publishes a job and validates the public listing. Append
`dashboard-list-pagination.spec.ts` to `test:e2e:recruiter` because it validates
recruiter candidate/application lists. Preserve existing command flags.

**Verify**: inspect the corresponding workflow jobs and confirm they invoke
those package scripts. Run each individual spec locally; each must pass.

### Step 2: Add a complete critical-flow inventory guard

Extend `e2e-harness-contract.test.ts` to read every
`e2e/critical-flows/*.spec.ts` filename and every `test:e2e:*` script used by a
job named in `e2e-required.needs`. Fail with the uncovered filenames when any
critical-flow spec is absent. Use an explicit empty allowlist initially; future
manual-only exceptions must include a one-line rationale beside the filename.

Do not count the broad local `test:e2e` command as required coverage. Only
scripts actually invoked by required jobs satisfy the guard.

**Verify**: temporarily remove one mapped filename and confirm the focused unit
test fails naming that file; restore it and confirm the test passes.

### Step 3: Run the affected packs

Run the full recruiter and job-lifecycle scripts against the standard E2E
harness, then run conventions and unit tests.

**Verify**: both packs, focused contract test, conventions, and full unit tests
exit 0.

## Test plan

- Inventory guard passes with every critical-flow spec mapped.
- Negative fixture or temporary mutation proves an omitted spec is named.
- Both newly mapped specs pass individually and inside their full pack.
- `e2e/accessibility` remains covered by the directory-based a11y command and
  must not be incorrectly included in the critical-flow inventory.

## Done criteria

- [ ] Both previously uncovered specs run in jobs required by `e2e-required`.
- [ ] A machine-checkable guard prevents future unmapped critical-flow specs.
- [ ] The guard ignores broad local-only Playwright discovery.
- [ ] Affected packs, unit tests, and conventions pass.
- [ ] `git diff --check` exits 0 and only in-scope files changed.

## STOP conditions

- Either spec is intentionally manual due to destructive or production-only behavior.
- Adding the pagination test makes its shared pack exceed the workflow timeout.
- The required workflow dynamically invokes scripts in a way the inventory test cannot resolve without a brittle YAML parser.

## Maintenance notes

Reviewers should require every new critical-flow spec to join a required pack in
the same change. If pack duration becomes unacceptable, split a named job while
keeping the inventory guarantee.
