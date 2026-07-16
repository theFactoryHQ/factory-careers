# Reliability And Maintainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining parser, migration, score display, query, type-contract, lint, and documentation findings.

**Architecture:** Small reliability fixes stay isolated; query changes are benchmarked before indexing; shared request contracts replace parallel type declarations; CI enforces a deliberately small lint baseline.

**Tech Stack:** Nuxt 4, PostgreSQL, Drizzle, pdf-parse, ESLint, Vitest.

---

### Task 1: Keep migration locking on one PostgreSQL session

**Files:**
- Modify: `server/plugins/migrations.ts`
- Test: `tests/unit/migration-locking.test.ts`

- [ ] Write a failing dependency-injected test requiring acquire, migrate, unlock, and client close on the same reserved client.
- [ ] Create a dedicated `postgres(env.DATABASE_URL, { max: 1 })` client in the plugin, build a Drizzle instance from it, and unlock/close in `finally`.
- [ ] Make lock contention wait/retry or verify schema currency before startup proceeds.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `fix: keep migration lock ownership on one session`.

### Task 2: Harden parser lifecycle and add a format corpus

**Files:**
- Modify: `server/utils/resume-parser.ts`
- Create: `tests/fixtures/resumes/README.md`
- Create: `tests/unit/resume-parser-corpus.test.ts`
- Modify: `tests/unit/resume-parser.test.ts`

- [ ] Write a failing test proving `destroy()` runs when PDF extraction rejects.
- [ ] Move parser cleanup into `finally` without changing the null-on-failure contract.
- [ ] Add sanitized/generated fixtures for multi-page, compressed, subset-font, multi-column, valid DOCX, and valid DOC inputs; explicitly assert encrypted/image-only classification.
- [ ] Run parser tests and the production bundle verifier; expect pass.
- [ ] Commit with `test: cover representative resume formats`.

### Task 3: Separate latest success from latest scoring attempt

**Files:**
- Modify: `server/api/applications/[id]/scores.get.ts`
- Modify: `app/components/ScoreBreakdown.vue`
- Test: `tests/unit/score-run-display.test.ts`

- [ ] Write a failing test with a completed run followed by a failed run.
- [ ] Return `latestSuccessfulRun` and `latestAttempt`; render scores/summary from success and failure state from the attempt.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `fix: preserve successful score display after retries`.

### Task 4: Move property filter intersection into PostgreSQL

**Files:**
- Modify: `server/utils/properties.ts`
- Modify: `server/api/applications/index.get.ts`
- Modify: `server/api/candidates/index.get.ts`
- Test: `tests/unit/property-filter-query.test.ts`

- [ ] Write failing semantic tests for equality, contains, multi-select, empty values, and multi-filter intersection.
- [ ] Replace materialized ID sets with correlated `EXISTS` predicates applied before pagination.
- [ ] Capture `EXPLAIN ANALYZE` against representative local data; add an index only when the plan demonstrates benefit.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `perf: filter custom properties in PostgreSQL`.

### Task 5: Share job request contracts

**Files:**
- Modify: `server/utils/schemas/job.ts`
- Create: `shared/job-contract.ts`
- Modify: `app/composables/useJobs.ts`
- Modify: `app/composables/useJob.ts`
- Modify: `app/pages/dashboard/jobs/new.vue`
- Modify: `app/pages/dashboard/jobs/[id]/application-form.vue`
- Test: `tests/unit/job-contract.test.ts`

- [ ] Write a failing type/contract test covering create defaults and patch null/optional semantics.
- [ ] Export shared inferred request types and explicit form-to-request adapters.
- [ ] Remove duplicated payload declarations and `as any`.
- [ ] Run focused tests and typecheck; expect pass.
- [ ] Commit with `refactor: share typed job request contracts`.

### Task 6: Enforce lint and reconcile setup documentation

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/run-pr-validation-preflight.mjs`
- Modify: `.github/workflows/pr-validation.yml`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `CONTRIBUTING.md`
- Test: `tests/unit/repository-quality-gates.test.ts`

- [ ] Write a failing source-contract test requiring a real lint command in package scripts, preflight, and CI, plus one canonical host-development URL.
- [ ] Add a Nuxt/Vue-aware ESLint flat configuration with a small zero-warning baseline and make lint mandatory.
- [ ] Split host and Docker setup instructions; consistently use port 3001 for `npm run dev` and port 3000 only for Docker.
- [ ] Run lint, convention checks, and typecheck; expect exit 0.
- [ ] Commit with `chore: enforce repository quality gates`.

### Task 7: Validate the final PR

- [ ] Run unit tests, lint, typecheck, build, conventions, CLI parity, production-env validation, and full preflight.
- [ ] Request spec and code-quality review; resolve and reverify every blocking issue.
- [ ] After merge, run a fresh full preflight against updated `main`.
