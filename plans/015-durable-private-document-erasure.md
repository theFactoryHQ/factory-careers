# Plan 015: Make private-document erasure durable and truthful

> **Executor instructions**: This plan changes destructive privacy behavior.
> Work only from a fresh `codex/durable-document-erasure` branch based on
> `origin/main` after plan 014 has landed. Run every verification gate. Stop and
> report on any STOP condition. Never run cleanup against production or shared
> storage. Update the plan index after completion unless the reviewer owns it.
>
> **Drift check (run first)**:
> `git diff --stat 88f7c18..HEAD -- server/database server/utils/documentDeletion.ts server/utils/privacyRequests.ts 'server/api/privacy-requests/[id]/fulfill.post.ts' 'server/api/candidates/[id].delete.ts' server/utils/auth.ts server/plugins server/api/operations shared packages/careers-cli tests docs CHANGELOG.md render.yaml`
>
> Plan 014's added no-op migration, snapshot, journal append, checker, and tests
> are expected drift. Compare and continue when those are the only relevant
> changes. Stop for any other drift that changes the deletion paths or queue
> conventions described below.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/014-restore-drizzle-snapshot-baseline.md`
- **Category**: security
- **Planned at**: commit `88f7c18`, 2026-08-23

## Why this matters

Document, candidate, privacy-request, and organization deletion commit
relational removal before object-storage deletion. S3 failures are logged and
then forgotten. A privacy request is marked completed even when private files
remain, and organization deletion retains retry keys only in process memory.

Erasure must become a durable, retryable state transition. The system may report
logical deletion promptly, but it must not report privacy fulfillment complete
until every associated object is confirmed absent.

## Current state

- `server/utils/documentDeletion.ts:67-75` deletes the database row, catches S3
  failure, logs, and returns success.
- `server/api/candidates/[id].delete.ts:15-40` commits candidate cascade deletion
  before `Promise.allSettled` storage cleanup and returns 204 despite failures.
- `server/utils/privacyRequests.ts:131-183` commits candidate/document cascades
  and only logs rejected storage deletes.
- `server/api/privacy-requests/[id]/fulfill.post.ts:46-70` then marks the request
  `completed` unconditionally.
- `server/utils/auth.ts:317-365` holds organization document keys in an in-memory
  map between Better Auth before/after hooks and forgets failed deletes.
- Reuse queue conventions from `server/utils/processingQueue.ts`,
  `server/utils/candidateWorkflowEmailQueue.ts`, and migration
  `0062_candidate_workflow_email_queue.sql`: stable dedupe key, bounded attempts,
  `available_at`, lease expiry, `FOR UPDATE SKIP LOCKED`, lease fencing, result
  codes, partial indexes, and worker telemetry.
- Product intent in `docs/reference/PRODUCT.md` requires candidate data to stay
  private and auditable.

## Required domain contract

Create a durable document-erasure queue/outbox with:

- immutable storage key and stable dedupe key;
- nullable organization reference using `ON DELETE SET NULL`, so organization
  deletion cannot remove pending erasure work;
- optional privacy-request association;
- pending, processing, completed, and failed states;
- bounded retries, `availableAt`, attempt count, lease expiry, completion time,
  and sanitized result code;
- a unique dedupe index and runnable partial index;
- server-role-only RLS consistent with other processing tables.

Enqueue tombstones inside the same transaction that removes relational document
ownership. The worker must treat S3 `NoSuchKey`/404 as successful erasure,
retry transient failures, fence stale leases, and never log candidate PII or
storage contents.

For privacy requests, keep the request `in_review` while associated tombstones
remain pending or retryable. The worker may mark it `completed` only after all
associated tombstones are completed. Terminal failure must remain visible to an
authorized operator and must not produce a completed status.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Migration discipline | `npm run check:migration-discipline` | exit 0 |
| Migration rehearsal | `npm run test:integration:migrations` | exit 0 against isolated PostgreSQL |
| Focused unit tests | `npm run test:unit -- tests/unit/document-deletion.test.ts tests/unit/document-erasure-queue.test.ts tests/unit/document-erasure-worker.test.ts tests/unit/privacy-request-contracts.test.ts` | all pass |
| PostgreSQL integration | `FACTORY_CORE_PG_TEST_URL="$DATABASE_MIGRATION_URL" FACTORY_CORE_PG_REQUIRED=true npm run test:integration:postgres-core` | all pass, zero skipped |
| CLI parity | `npm run preflight:cli-parity` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build` | exit 0 |
| Full preflight | `npm run preflight:pr` | exit 0 |

Use only disposable PostgreSQL and S3/MinIO fixtures. Never put connection
strings, keys, candidate data, or storage keys in committed fixtures or plans.

## Scope

**In scope**:

- `server/database/schema/app.ts`
- one new append-only migration and generated metadata after plan 014
- `server/utils/documentErasureQueue.ts` (create)
- `server/plugins/document-erasure-worker.ts` (create)
- `server/utils/documentDeletion.ts`
- `server/utils/privacyRequests.ts`
- `server/api/privacy-requests/[id]/fulfill.post.ts`
- `server/api/candidates/[id].delete.ts`
- `server/utils/auth.ts` organization deletion hooks
- operator-safe erasure queue status/drain route under `server/api/operations`
- corresponding CLI system/operations command, route-coverage manifest, and CLI docs
- `server/utils/env.ts`, `.env.example`, `render.yaml`, operational docs
- focused unit and PostgreSQL integration tests
- `CHANGELOG.md`

**Out of scope**:

- Deleting objects by an unscoped bucket-wide prefix.
- Changing candidate-retention policy or privacy-request eligibility.
- Replaying application-intake recovery receipts; they have a separate expiry path.
- Returning storage keys, provider errors, candidate names, or emails through APIs.
- Changing general processing or email queue schemas.
- Running historical cleanup against production; prepare a separate approved reconciliation runbook only.

## Git workflow

- Branch: `codex/durable-document-erasure`
- Commit sequence:
  1. `feat: add durable document erasure queue`
  2. `fix: make privacy erasure completion truthful`
  3. `docs: document document erasure operations`
- Use `git commit --no-verify` for agent commits, then run every gate manually.
- Do not push, open a PR, enable a production worker, or run reconciliation unless instructed.

## Steps

### Step 1: Add the append-only queue schema

Add the Drizzle table and a generated migration after the plan-014 baseline.
Model status, leasing, indexes, constraints, and RLS on the established queues.
Keep enough ownership metadata for authorization and privacy completion after
candidate, document, or organization rows disappear.

**Verify**: migration discipline and isolated base-to-branch rehearsal pass.
Schema tests assert `ON DELETE SET NULL`, unique dedupe, runnable index, attempts
constraints, and server-role-only RLS.

### Step 2: Implement atomic enqueue and lease-fenced processing

Create pure dedupe/result-code helpers and a database adapter. Provide functions
to enqueue tombstones using a supplied transaction, claim bounded batches with
`FOR UPDATE SKIP LOCKED`, renew or fence leases, complete on confirmed absence,
and retry/fail with bounded backoff. Treat missing objects as success.

**Verify**: unit tests cover dedupe, concurrent claims, retry scheduling, stale
lease rejection, missing-object success, terminal failure, and sanitized logs.
Add PostgreSQL concurrency tests for two claimers.

### Step 3: Replace best-effort deletion paths

- `documentDeletion.ts`: enqueue the storage key in the same transaction that
  cancels processing and removes the document row.
- candidate deletion and privacy cascades: enqueue every cascade document in
  the candidate-deletion transaction; remove inline `Promise.allSettled` cleanup.
- organization deletion: persist tombstones in `beforeDeleteOrganization` with
  nullable/set-null organization ownership; remove the in-memory pending map and
  after-hook S3 loop.

Preserve tenant scoping and return shapes except where privacy completion must
become pending.

**Verify**: failure-path tests prove a transaction cannot commit relational
deletion without its tombstone and a worker/provider failure never loses the
retry record.

### Step 4: Make privacy completion depend on erasure completion

Associate privacy-origin tombstones with the request. After the relational
deletion transaction, keep status `in_review` and return a stable pending result.
When the worker completes a tombstone, check all tombstones for that request in
the same transaction; mark the request completed only when none are pending,
processing, or failed. A failed tombstone must keep the request incomplete.

**Verify**: integration tests cover zero documents, all objects deleted, object
already absent, transient failure then success, terminal failure, worker restart,
and concurrent worker completion. Only successful/absent cases reach completed.

### Step 5: Add worker activation and operator-safe visibility

Add `DOCUMENT_ERASURE_WORKER_ENABLED`, disabled by default outside explicitly
configured production. Follow existing worker lifecycle and structured telemetry
patterns. Add an owner/instance-admin-safe status and drain surface that returns
counts, ages, statuses, and sanitized result codes only. Add CLI parity for this
new operational route.

**Verify**: worker plugin tests cover disabled, enabled, overlapping-cycle
prevention, graceful shutdown, and failure logging. API/CLI tests prove no PII or
storage keys are returned.

### Step 6: Document staged rollout and reconciliation

Document migration, deploy with worker disabled, queue-path smoke tests against
MinIO, worker enablement, backlog monitoring, rollback, and alert thresholds.
Prepare a separate human-approved reconciliation command/runbook for previously
orphaned objects; do not execute it. Add a changelog entry explaining that
privacy fulfillment remains pending until storage erasure succeeds.

**Verify**: conventions, CLI parity, typecheck, build, full preflight, migration
rehearsal, and focused PostgreSQL tests all pass.

## Test plan

- Unit: dedupe keys, retry/backoff, missing-object success, terminal failure,
  lease fencing, log redaction, privacy completion aggregation.
- PostgreSQL: transactional enqueue, concurrent claims, worker restart,
  organization `SET NULL`, privacy status transitions.
- Route: candidate/document deletion returns only after tombstone commit;
  privacy fulfillment returns pending until the worker completes all objects.
- Worker: disabled/enabled lifecycle, one cycle at a time, sanitized metrics.
- CLI: JSON contract, authorization, status counts, drain confirmation flags.
- Migration: base-to-branch rehearsal and current Drizzle snapshot alignment.

## Done criteria

- [ ] Every relational document-deletion path atomically persists a tombstone.
- [ ] Organization deletion cannot cascade away pending erasure work.
- [ ] Missing S3 objects count as successfully erased.
- [ ] Transient failures retry; terminal failures remain visible and incomplete.
- [ ] Privacy requests cannot become completed while any erasure is unfinished or failed.
- [ ] API, CLI, logs, and metrics expose no PII, storage keys, or provider details.
- [ ] Migration, PostgreSQL, CLI parity, unit, typecheck, build, and full preflight gates pass.
- [ ] Production worker and reconciliation remain disabled/unexecuted without separate approval.
- [ ] `git diff --check` exits 0 and only in-scope files changed.

## STOP conditions

- Plan 014 is not complete or the latest migration snapshot is stale.
- Better Auth organization hooks cannot atomically persist tombstones before organization deletion.
- The production bucket cannot distinguish missing-object responses from retryable provider failures.
- Privacy status semantics require legal or policy approval beyond the existing `in_review`/`completed` contract.
- Any design requires bucket-wide or cross-tenant deletion by prefix.
- Verification would touch production or shared client data.

## Maintenance notes

Reviewers should scrutinize transaction boundaries, `ON DELETE` behavior,
lease fencing, missing-object classification, privacy status transitions, and
redaction. Future storage migrations must drain or port this queue before old
credentials or buckets are retired.
