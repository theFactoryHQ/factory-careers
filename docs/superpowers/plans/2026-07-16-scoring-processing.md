# Scoring And Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scoring rubric-safe, resumable, observable, and identical across automatic, browser, CLI, and reparsing paths.

**Architecture:** Model output is reconciled against canonical criteria before persistence. A PostgreSQL-backed processing queue atomically claims bounded tasks and records retry state; a Nitro worker and explicit drain endpoint use the same processor.

**Tech Stack:** Nuxt 4, Drizzle/PostgreSQL, structured AI output, CLI, Vitest.

---

### Task 1: Reconcile scoring output with the canonical rubric

**Files:**
- Modify: `server/utils/ai/scoring.ts`
- Test: `tests/unit/ai-scoring-validation.test.ts`

- [ ] Write failing tests for missing, duplicate, unknown, mismatched-maximum, zero-maximum, and over-maximum evaluations.
- [ ] Add `reconcileEvaluations(criteria, evaluations)` that requires exactly one evaluation per stored criterion, ignores model maxima, and clamps against `criterion.maxScore`.
- [ ] Delimit resume, cover letter, and notes in separate untrusted-data tags and add an explicit system rule to ignore embedded instructions.
- [ ] Make `computeCompositeScore` accept only reconciled evaluations.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `fix: validate AI scores against stored rubrics`.

### Task 2: Add durable processing records and atomic claiming

**Files:**
- Modify: `server/database/schema/app.ts`
- Create: `server/database/migrations/0053_processing_queue.sql`
- Modify: `server/database/migrations/meta/_journal.json`
- Create: `server/utils/processingQueue.ts`
- Test: `tests/unit/processing-queue.test.ts`

- [ ] Write failing state-transition tests for enqueue idempotency, bounded claims, completion, retry backoff, and terminal failure.
- [ ] Add processing batch/task tables with organization, type, resource ID, status, attempt count, availability, lease, error, and timestamps.
- [ ] Implement claim SQL with `FOR UPDATE SKIP LOCKED`, finite leases, and a maximum attempt count.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `feat: add durable recruiting processing queue`.

### Task 3: Extract reusable single-application analysis

**Files:**
- Create: `server/utils/analyzeApplication.ts`
- Modify: `server/api/applications/[id]/analyze.post.ts`
- Modify: `server/utils/ai/autoScore.ts`
- Test: `tests/unit/analyze-application.test.ts`

- [ ] Write a failing unit test for success, parse failure, missing criteria, provider failure, and preserved latest successful score metadata.
- [ ] Move analysis and persistence into `analyzeApplication({ organizationId, applicationId, aiConfigId, scoredById })`.
- [ ] Store the successful summary/raw response consistently for manual and automatic analysis.
- [ ] Keep the HTTP route responsible only for auth, rate limiting, validation, and response mapping.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `refactor: share application analysis execution`.

### Task 4: Process scoring and parsing tasks

**Files:**
- Create: `server/utils/processRecruitingTasks.ts`
- Create: `server/plugins/recruiting-worker.ts`
- Create: `server/api/processing/[id].get.ts`
- Create: `server/api/processing/[id]/drain.post.ts`
- Modify: `server/api/jobs/[id]/analyze-all.post.ts`
- Modify: `server/api/documents/parse-all.post.ts`
- Modify: `server/api/documents/[id]/parse.post.ts`
- Modify: `server/api/public/jobs/[slug]/apply.post.ts`
- Test: `tests/unit/recruiting-processing.test.ts`

- [ ] Write failing tests that prove bulk endpoints enqueue rather than loop, reparsing enqueues affected scoring, and a restarted worker can reclaim an expired lease.
- [ ] Implement bounded queue draining for `application_analysis` and `document_parse` task types.
- [ ] Start a small unref’d polling worker outside prerender/test contexts; all correctness remains in persisted queue state.
- [ ] Return batch IDs and structured progress.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `feat: make parsing and scoring resumable`.

### Task 5: Align browser and CLI batch behavior

**Files:**
- Modify: `app/components/JobSubNavActions.vue`
- Modify: `packages/careers-cli/src/commands/jobs.ts`
- Modify: `packages/careers-cli/src/commands/documents.ts`
- Modify: `docs/CLI.md`
- Test: `tests/unit/cli-job-workflow-commands.test.ts`
- Test: `tests/unit/cli-documents-commands.test.ts`

- [ ] Write failing CLI tests requiring batch creation, progress polling/draining, and structured attempted/succeeded/failed counts.
- [ ] Replace per-application browser requests with persisted batch progress.
- [ ] Implement deterministic CLI draining with `--json`, interruption-safe batch ID output, and nonzero status on terminal failures.
- [ ] Run focused tests and CLI parity preflight; expect pass.
- [ ] Commit with `fix: align browser and CLI processing batches`.

### Task 6: Validate the processing PR

- [ ] Run unit tests, typecheck, build, conventions, CLI parity, production-env validation, and full preflight.
- [ ] Run AI candidate-review and resume-upload smoke flows.
- [ ] Request spec and code-quality review; resolve and reverify every blocking issue.
