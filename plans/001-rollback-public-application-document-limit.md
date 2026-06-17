# Plan 001: Make public application document-limit failures rollback-safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 277bca7..HEAD -- 'server/api/public/jobs/[slug]/apply.post.ts' tests/unit/security-route-coverage.test.ts tests/unit/public-application-document-limit.test.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `277bca7`, 2026-06-15

## Why this matters

The public application endpoint creates the application and related side rows
before checking whether the candidate is already at the document limit. If that
limit check throws, the applicant sees a failure but the application row can
remain in the database. Because applications are unique by organization,
candidate, and job, that failed attempt can block a legitimate retry.

This should be fixed before broadening upload behavior because it is a data
integrity bug in the core public application flow.

## Current state

Relevant files:

- `server/api/public/jobs/[slug]/apply.post.ts` - public application submission
  route; creates candidates, applications, compliance answers, attribution, and
  uploaded documents.
- `server/database/schema/app.ts` - declares the unique application constraint
  and cascade behavior for side tables.
- `tests/unit/security-route-coverage.test.ts` - existing static security
  regression tests for route behavior; currently checks that rollback code
  exists but not that every pre-upload failure path uses it.

Current application creation happens before the document-limit check:

```ts
// server/api/public/jobs/[slug]/apply.post.ts:451
const [newApplication] = await db.insert(application).values({
  organizationId: orgId,
  candidateId,
  jobId,
  status: 'new',
  coverLetterText: coverLetterText || null,
}).returning({ id: application.id })
```

The route then writes side rows tied to that application:

```ts
// server/api/public/jobs/[slug]/apply.post.ts:472
if (newApplication && hasComplianceResponse(normalizedCompliance)) {
  await db.insert(applicationComplianceResponse).values({
    organizationId: orgId,
    applicationId: newApplication.id,
    candidateId,
    ...
  })
}

// server/api/public/jobs/[slug]/apply.post.ts:517
await db.insert(applicationSource).values({
  organizationId: orgId,
  applicationId: newApplication!.id,
  ...
})

// server/api/public/jobs/[slug]/apply.post.ts:541
if (validResponses.length > 0) {
  await db.insert(questionResponse).values(
    validResponses.map((r) => ({
      organizationId: orgId,
      applicationId: newApplication!.id,
      questionId: r.questionId,
      value: r.value,
    })),
  )
}
```

Only after those writes does the route check the candidate document limit:

```ts
// server/api/public/jobs/[slug]/apply.post.ts:556
const builtInFileCount = resumeUpload ? 1 : 0
const totalNewFiles = uploadedFiles.size + builtInFileCount
if (totalNewFiles > 0) {
  const existingDocCount = await db.$count(
    document,
    and(
      eq(document.candidateId, candidateId),
      eq(document.organizationId, orgId),
    ),
  )

  if (existingDocCount + totalNewFiles > MAX_DOCUMENTS_PER_CANDIDATE) {
    throw createError({
      statusCode: 409,
      statusMessage: `Document limit reached. Maximum ${MAX_DOCUMENTS_PER_CANDIDATE} documents per candidate`,
    })
  }
}
```

Later S3/document failures do call rollback:

```ts
// server/api/public/jobs/[slug]/apply.post.ts:637
await rollbackApplicationSubmission({
  applicationId: newApplication!.id,
  organizationId: orgId,
  uploadedDocuments,
})
```

The schema makes a failed persisted application especially harmful because of
the unique index:

```ts
// server/database/schema/app.ts:166
uniqueIndex('application_org_candidate_job_idx').on(t.organizationId, t.candidateId, t.jobId)
```

Repo conventions to follow:

- Public application validation lives in the route and shared schemas, not in
  ad hoc middleware.
- Expected negative paths should throw structured `createError` responses with
  useful status codes and without noisy production logs.
- Tests for route invariants commonly read source files and assert ordering or
  required constructs. See `tests/unit/security-route-coverage.test.ts:347`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift check | `git diff --stat 277bca7..HEAD -- 'server/api/public/jobs/[slug]/apply.post.ts' tests/unit/security-route-coverage.test.ts tests/unit/public-application-document-limit.test.ts` | no in-scope drift, or reviewed drift with matching current state |
| Focused tests | `npm run test:unit -- tests/unit/security-route-coverage.test.ts tests/unit/public-application-document-limit.test.ts` | exit 0; new document-limit regression passes |
| Unit suite | `npm run test:unit` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:

- `server/api/public/jobs/[slug]/apply.post.ts`
- `tests/unit/security-route-coverage.test.ts`
- `tests/unit/public-application-document-limit.test.ts` if you choose a new
  focused test file instead of extending the existing security coverage file.

**Out of scope**:

- Database schema or migrations.
- Candidate creation semantics. It is acceptable for the candidate upsert to
  happen before the document-limit rejection; this plan is about preventing a
  failed application row and its application-scoped side rows.
- S3 storage helpers and document parsing behavior.
- Public response shape other than preserving the existing `409` document limit
  error.

## Git workflow

- Branch: `codex/001-rollback-public-application-document-limit`
- Commit message: `fix: keep public application document-limit failures atomic`
- Do not push or open a PR unless the operator instructs you to.

## Steps

### Step 1: Add a failing regression for document-limit ordering

Add a focused unit test that proves the document-limit check happens before
`db.insert(application).values(...)` and before application-scoped side rows.
The repo already uses source-order tests for route invariants, so a static
regression is acceptable here.

Preferred shape in `tests/unit/public-application-document-limit.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('public application document limit handling', () => {
  it('checks candidate document capacity before creating application side effects', () => {
    const source = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')

    const limitCheckIndex = source.indexOf('existingDocCount + totalNewFiles > MAX_DOCUMENTS_PER_CANDIDATE')
    const applicationInsertIndex = source.indexOf('db.insert(application).values')
    const complianceInsertIndex = source.indexOf('db.insert(applicationComplianceResponse).values')
    const sourceInsertIndex = source.indexOf('db.insert(applicationSource).values')
    const questionResponseInsertIndex = source.indexOf('db.insert(questionResponse).values(\\n      validResponses.map')

    expect(limitCheckIndex).toBeGreaterThanOrEqual(0)
    expect(applicationInsertIndex).toBeGreaterThanOrEqual(0)
    expect(limitCheckIndex).toBeLessThan(applicationInsertIndex)
    expect(limitCheckIndex).toBeLessThan(complianceInsertIndex)
    expect(limitCheckIndex).toBeLessThan(sourceInsertIndex)
    expect(limitCheckIndex).toBeLessThan(questionResponseInsertIndex)
  })
})
```

If the exact strings need small adjustment after editing, keep the assertion
intent: the document capacity check must run before any application-scoped
write.

**Verify**: `npm run test:unit -- tests/unit/public-application-document-limit.test.ts` -> fails before the route edit, because the limit check currently occurs after application creation.

### Step 2: Move the document-limit check before application creation

In `server/api/public/jobs/[slug]/apply.post.ts`, move the existing block that
computes `builtInFileCount`, `totalNewFiles`, `existingDocCount`, and throws the
`409` document-limit error to just after the duplicate-application check and
before the "Create application" section.

Target order:

1. Candidate is resolved or created.
2. Duplicate application is checked.
3. Candidate document capacity is checked if files are included.
4. Application is inserted.
5. Compliance, source attribution, text question responses, and file uploads
   proceed.

Do not leave a second copy of the document-limit check in the old location.
Do not change the error status or message unless a test requires only harmless
formatting updates.

**Verify**: `npm run test:unit -- tests/unit/public-application-document-limit.test.ts` -> exit 0.

### Step 3: Preserve existing rollback coverage

Keep `rollbackApplicationSubmission` in place for S3/document upload failures.
The moved capacity check should prevent pre-upload document-limit failures from
creating application side effects; it does not replace rollback for failures
that occur after S3 upload or document DB insert begins.

If you added a new test file in Step 1, keep the existing rollback existence
test in `tests/unit/security-route-coverage.test.ts` unchanged unless its
strings need a minor update.

**Verify**: `npm run test:unit -- tests/unit/security-route-coverage.test.ts tests/unit/public-application-document-limit.test.ts` -> exit 0.

### Step 4: Run broader checks

Run the repo checks relevant to this route change.

**Verify**:

- `npm run test:unit` -> exit 0.
- `npm run typecheck` -> exit 0.

## Test plan

- Add `tests/unit/public-application-document-limit.test.ts` or extend
  `tests/unit/security-route-coverage.test.ts`.
- The new regression must fail against commit `277bca7` and pass after the
  route reorder.
- Keep the existing rollback test for upload failures passing.

## Done criteria

All must hold:

- [ ] The document-limit check occurs before `db.insert(application).values` in
      `server/api/public/jobs/[slug]/apply.post.ts`.
- [ ] There is no duplicate copy of the same document-limit block later in the
      route.
- [ ] A unit regression covers the ordering.
- [ ] `npm run test:unit -- tests/unit/security-route-coverage.test.ts tests/unit/public-application-document-limit.test.ts` exits 0.
- [ ] `npm run test:unit` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] No files outside the in-scope list are modified, except `plans/README.md`
      status if you were asked to update it.

## STOP conditions

Stop and report back if:

- The route has already been refactored into a transaction or service layer and
  the current-state excerpts no longer match.
- Moving the document-limit check would require changing candidate creation,
  schema constraints, or the public API response shape.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Reviewers should scrutinize ordering, not just the presence of rollback code.
Future public application changes that add side effects before file upload
should either happen after all preflight checks or be covered by rollback.
