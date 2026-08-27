# Plan 010: Make scoring-criteria replacement atomic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before continuing. If a
> STOP condition occurs, stop and report; do not improvise. Start from a fresh
> `codex/atomic-scoring-criteria` branch based on current `origin/main`. When
> done, update this plan's row in `plans/README.md` unless the reviewer owns the
> index.
>
> **Drift check (run first)**:
> `git diff --stat 88f7c18..HEAD -- 'server/api/jobs/[id]/criteria/index.post.ts' server/utils/schemas/scoring.ts server/database/schema/app.ts tests/unit CHANGELOG.md`
>
> If an in-scope file changed, compare the excerpts below with live code. Stop
> when the route's replace strategy or unique-key contract no longer matches.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `88f7c18`, 2026-08-23

## Why this matters

The bulk scoring endpoint deletes the current rubric before inserting its
replacement. The request schema accepts duplicate criterion keys while the
database enforces uniqueness by job and key. A duplicate key or any insert
failure therefore returns an error after permanently erasing a working rubric.

The replacement must be all-or-nothing, and invalid duplicates should fail at
the request boundary before any database write.

## Current state

- `server/api/jobs/[id]/criteria/index.post.ts:26-48` deletes and inserts with
  the global `db` object and no transaction:

  ```ts
  await db.delete(scoringCriterion).where(...)
  const created = await db.insert(scoringCriterion).values(values).returning()
  ```

- `server/utils/schemas/scoring.ts:69-71` only constrains array length:

  ```ts
  export const bulkCriteriaSchema = z.object({
    criteria: z.array(createCriterionSchema).min(1).max(20),
  })
  ```

- `server/database/schema/app.ts:1172` enforces
  `uniqueIndex('scoring_criterion_job_key_idx').on(t.jobId, t.key)`.
- Model route-level mocks and transaction assertions after
  `tests/unit/scoring-feedback-api.test.ts:1-75`.
- API and shared-contract changes require the CLI parity preflight. User-visible
  fixes require an `Unreleased / Fixed` entry in `CHANGELOG.md`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `npm run test:unit -- tests/unit/scoring-criteria-replacement.test.ts` | all tests pass |
| CLI parity | `npm run preflight:cli-parity` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Full unit suite | `npm run test:unit` | exit 0 |

## Scope

**In scope**:

- `server/utils/schemas/scoring.ts`
- `server/api/jobs/[id]/criteria/index.post.ts`
- `tests/unit/scoring-criteria-replacement.test.ts` (create)
- `CHANGELOG.md`

**Out of scope**:

- Schema or migration changes; the existing unique index is correct.
- Changes to criterion scoring mathematics or AI prompts.
- CLI command shape or API response shape.
- Job-creation wizard behavior.

## Git workflow

- Branch: `codex/atomic-scoring-criteria`
- Commit: `fix: make scoring criteria replacement atomic`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Reject duplicate keys before database access

Add a `superRefine` to `bulkCriteriaSchema`. Track exact criterion keys in a
`Set`. Add a custom Zod issue at `['criteria', index, 'key']` for every repeated
key after its first occurrence. Preserve case sensitivity because the database
index is case-sensitive; do not silently normalize user keys.

**Verify**: run the focused test file with schema-only cases for unique keys,
one duplicate, and multiple duplicates. Expected: duplicate payloads fail and
the issue path identifies the repeated entry.

### Step 2: Enclose delete and insert in one transaction

Use `db.transaction(async (tx) => { ... })`. Perform both the scoped delete and
replacement insert through `tx`, return the created rows from the callback, and
leave `recordActivity` after the committed transaction. Do not change the
authorization, organization filters, status code, or response body.

**Verify**: route tests must show `db.transaction` called once, both writes use
the callback executor, and the activity call occurs only after the callback
resolves.

### Step 3: Prove rollback behavior and document the fix

Add a failure-path route test whose transaction adapter rejects the insert and
asserts that the handler rejects without calling post-commit activity. The mock
cannot prove PostgreSQL rollback mechanics; it must prove the route gives both
writes to one transaction. Add a concise `Fixed` changelog entry.

**Verify**: run focused tests, CLI parity, typecheck, lint, and the full unit
suite. Expected: every command exits 0.

## Test plan

Create `tests/unit/scoring-criteria-replacement.test.ts` with:

- schema accepts distinct keys;
- schema rejects repeated exact keys with the correct path;
- route verifies job ownership before writes;
- route performs delete and insert through one transaction executor;
- simulated insert failure prevents activity logging and escapes as an error;
- successful response retains `{ criteria: created }` and status 201.

## Done criteria

- [ ] Duplicate keys fail validation before `db.transaction`.
- [ ] Delete and insert share one transaction executor.
- [ ] Existing authorization, tenant filters, response, and CLI contract remain unchanged.
- [ ] Focused tests, CLI parity, lint, typecheck, and full unit tests exit 0.
- [ ] `git diff --check` exits 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` status is updated.

## STOP conditions

- The live route no longer uses delete-then-insert replacement.
- The database unique contract is no longer `(jobId, key)`.
- Correctness requires a schema migration or API response change.
- Any verification fails twice after a scoped correction.

## Maintenance notes

Future bulk-replace endpoints should use this transaction pattern. Reviewers
should confirm the Zod rule matches PostgreSQL's exact case-sensitive key
semantics and that activity is not emitted before commit.
