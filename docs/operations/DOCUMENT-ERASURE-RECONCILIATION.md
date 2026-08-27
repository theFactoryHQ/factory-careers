# Legacy Document Erasure Reconciliation

Reconciliation finds private objects that predate durable tombstones or no
longer have an authorized relational owner. It is a separate privacy operation,
not a deployment step.

## Approval Boundary

Obtain separate privacy, security, and operations approval for the exact
inventory scope. Do not enable reconciliation as part of the worker rollout.
Do not use production storage for rehearsal.

## Dry Run

Build an inventory only from authorized relational provenance and scoped object
metadata. Never scan or delete a whole bucket or an unscoped prefix. The dry-run
artifact must contain opaque references and aggregate reason codes only; exclude
object names, candidate fields, document contents, provider payloads, and secrets.

Classify each item as linked, already absent, ambiguous, or eligible for a
durable tombstone. Reconcile database ownership and retention holds before any
write. A database miss alone is not deletion authority.

## Review And Pilot

1. Record the immutable dry-run artifact identifier and reviewed query version.
2. Have privacy and operations approve the eligible count and scope.
3. Run a small approved pilot that creates tombstones through the supported queue.
4. Monitor aggregate queue status until every pilot item is completed or failed.
5. Re-run the same dry-run and confirm the eligible count changed as expected.

Stop on an ambiguous owner, retention hold, scope expansion, failed tombstone,
unexpected count, or output containing sensitive fields. Preserve evidence and
request a new review before continuing.

## Completion

Scale only with a new recorded approval for the remaining bounded inventory.
Record aggregate before-and-after counts, sanitized result codes, and the worker
deployment identifier. Never mutate queue rows, delete objects directly, or
infer privacy-request completion outside the transactional reconciler.
