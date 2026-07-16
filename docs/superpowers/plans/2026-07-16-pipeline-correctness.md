# Pipeline Correctness And Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cross-candidate stale data and make every application reachable with correct pipeline counts and filters.

**Architecture:** Candidate detail caches are identity-bound. A job-pipeline API owns filtering, sorting, pagination, and stage counts; the Nuxt page incrementally loads results and preserves selection by application ID.

**Tech Stack:** Nuxt 4, Vue 3, Nitro, Drizzle/PostgreSQL, Vitest, Playwright.

---

### Task 1: Make candidate detail state identity-safe

**Files:**
- Modify: `app/pages/dashboard/jobs/[id]/index.vue`
- Modify: `app/components/ScoreBreakdown.vue`
- Test: `tests/unit/job-pipeline-selection-state.test.ts`
- Test: `e2e/critical-flows/job-pipeline-selection.spec.ts`

- [ ] Write a failing component/browser regression that delays candidate B’s detail response and asserts candidate A’s documents, properties, and score controls disappear immediately.
- [ ] Cache `{ applicationId, data }` and resolve only an exact ID match; otherwise render noninteractive skeletons.
- [ ] Key score data by application ID and clear expanded/error state on change.
- [ ] Run focused unit and browser tests; expect pass.
- [ ] Commit with `fix: isolate pipeline candidate detail state`.

### Task 2: Add a server-paginated pipeline contract

**Files:**
- Create: `server/utils/schemas/pipeline.ts`
- Create: `server/api/jobs/[id]/pipeline.get.ts`
- Create: `app/composables/useJobPipeline.ts`
- Test: `tests/unit/job-pipeline-api.test.ts`

- [ ] Write failing tests with 101 applications proving independent stage counts, page boundaries, search, score, interview, property filters, and stable sorting.
- [ ] Implement a maximum page size of 50 and return `{ data, total, page, limit, stageCounts }`.
- [ ] Scope every query by authorized organization and job.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `feat: add paginated job pipeline API`.

### Task 3: Migrate the pipeline page to incremental results

**Files:**
- Modify: `app/pages/dashboard/jobs/[id]/index.vue`
- Modify: `app/components/JobPipelineCandidateCard.vue`
- Test: `tests/unit/job-pipeline-chunk.test.ts`
- Test: `e2e/critical-flows/job-pipeline-pagination.spec.ts`

- [ ] Write failing tests requiring server-owned counts and a reachable 101st candidate.
- [ ] Replace `useApplications({ limit: 100 })` and client-wide filtering with `useJobPipeline`.
- [ ] Add an accessible load-more control, loading state, and result count; preserve keyboard selection and current ID when pages append.
- [ ] Run focused unit and browser tests at desktop and mobile viewports; expect pass with no horizontal bleed.
- [ ] Commit with `fix: load every pipeline candidate`.

### Task 4: Validate the pipeline PR

- [ ] Run unit tests, typecheck, build, conventions, full preflight, and dashboard smoke tests.
- [ ] Manually verify the reported production route shape in a local authenticated browser with 101+ seeded applications.
- [ ] Request spec and code-quality review; resolve and reverify every blocking issue.
