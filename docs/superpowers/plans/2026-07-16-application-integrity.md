# Application Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public submissions atomic, application-specific, and unavailable after the configured closing date.

**Architecture:** A shared public-job predicate owns schedule semantics. Documents optionally reference applications for legacy compatibility. Core database writes use one transaction and conflict-aware inserts; S3 uploads remain compensating operations.

**Tech Stack:** Nuxt 4, Nitro, Drizzle/PostgreSQL, S3, Vitest, Playwright.

---

### Task 1: Centralize public listing eligibility

**Files:**
- Create: `server/utils/publicJobVisibility.ts`
- Modify: `server/api/public/jobs/index.get.ts`
- Modify: `server/api/public/jobs/[slug].get.ts`
- Modify: `server/api/public/jobs/[slug]/apply.post.ts`
- Test: `tests/unit/public-job-visibility.test.ts`

- [ ] Write failing boundary tests for absent, future, current, and expired `validThrough` values.
- [ ] Implement conditions equivalent to `status = open AND activeFrom <= now AND (validThrough IS NULL OR validThrough >= now)` using one helper.
- [ ] Apply the helper to list, detail, and submission queries.
- [ ] Run the focused tests; expect pass.
- [ ] Commit with `fix: enforce public job expiration`.

### Task 2: Associate documents with applications

**Files:**
- Modify: `server/database/schema/app.ts`
- Create: `server/database/migrations/0050_application_documents.sql`
- Modify: `server/database/migrations/meta/_journal.json`
- Modify: `server/api/public/jobs/[slug]/apply.post.ts`
- Modify: `server/api/applications/[id].get.ts`
- Test: `tests/unit/application-document-association.test.ts`

- [ ] Write a failing schema/route test requiring nullable `document.applicationId`, its index, and public-upload assignment.
- [ ] Add the nullable foreign key with `ON DELETE SET NULL` and an index; record the migration after the latest main journal entry.
- [ ] Populate `applicationId` for built-in and custom-question uploads.
- [ ] Return application-associated documents first, with an explicit legacy fallback.
- [ ] Run focused tests and `npm run db:generate` only as a zero-diff verification; expect no untracked migration.
- [ ] Commit with `feat: associate submitted documents with applications`.

### Task 3: Make core submission writes conflict-aware and atomic

**Files:**
- Create: `server/utils/createPublicApplication.ts`
- Modify: `server/api/public/jobs/[slug]/apply.post.ts`
- Test: `tests/unit/public-application-transaction.test.ts`

- [ ] Write failing tests using an injected transaction adapter for compliance failure, response failure, and duplicate application races.
- [ ] Implement a transaction returning `{ candidateId, applicationId }`; use conflict-aware candidate upsert, application `onConflictDoNothing`, and transactional compliance and non-file responses.
- [ ] Convert an empty application insert result to the existing stable 409 response.
- [ ] Leave attribution best-effort and keep S3 cleanup as a saga that deletes the application on upload failure.
- [ ] Run focused tests; expect no partial records in every injected-failure case.
- [ ] Commit with `fix: make public application writes atomic`.

### Task 4: Select the application’s resume for scoring

**Files:**
- Create: `server/utils/applicationResume.ts`
- Modify: `server/api/applications/[id]/analyze.post.ts`
- Modify: `server/utils/ai/autoScore.ts`
- Test: `tests/unit/application-resume-selection.test.ts`

- [ ] Write failing tests proving application-associated resume wins and the legacy fallback is newest-first and deterministic.
- [ ] Implement `loadApplicationResume(orgId, applicationId, candidateId)` with those rules.
- [ ] Replace both unordered candidate document scans.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `fix: score the resume submitted for each application`.

### Task 5: Validate the application PR

- [ ] Run unit tests, typecheck, build, conventions, CLI parity, and `npm run preflight:pr`; expect exit 0.
- [ ] Run the public-application and resume-upload browser specs; expect pass.
- [ ] Request spec and code-quality review; resolve and reverify every blocking issue.
