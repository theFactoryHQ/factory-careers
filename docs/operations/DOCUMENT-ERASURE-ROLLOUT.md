# Durable Document Erasure Rollout

Use this runbook to introduce the private-document erasure worker. The worker is
opt-in. Keep it disabled until every approval and proof below is recorded.

## Prerequisites

1. Record the reviewed commit and deployment identifier.
2. Confirm the database and object-storage backup rehearsals are current.
3. Apply the bundled migrations through the normal startup migration gate.
4. Confirm readiness and the modeled-schema check pass.
5. Confirm `DOCUMENT_ERASURE_WORKER_ENABLED=false` in the deployed environment.

## Disposable Storage Proof

Use a local or otherwise disposable MinIO bucket with synthetic objects only.
Never point this proof at production or candidate storage.

1. Enqueue synthetic tombstones through the supported deletion paths.
2. Prove deletion of an existing object completes with `erased`.
3. Prove a missing object completes with `object_absent`.
4. Prove a transient storage failure returns to `pending` with backoff.
5. Prove an exhausted failure remains `failed` for investigation.
6. Prove a privacy request remains `in_review` until its last tombstone completes.
7. Prove logs and command output contain stable result codes and aggregates only.

Remove the disposable bucket and synthetic database after recording the proof.

## Disabled Production Observation

Deploy with the worker disabled. Run:

```bash
factory-careers operations document-erasure status --json
```

The response may contain worker state, queue counts, oldest active ages, and
sanitized result-code counts. It must not contain identifiers, storage keys,
timestamps, provider details, applicant data, or raw errors.

Use these initial alert thresholds until measured production behavior supports
a reviewed change:

- Page immediately when `failed` is greater than zero.
- Alert when the oldest pending item exceeds 15 minutes.
- Alert when the oldest processing item exceeds 5 minutes.
- Alert when pending work grows during three consecutive five-minute checks.

## Enablement

Record explicit privacy, security, and operations approval. Then set
`DOCUMENT_ERASURE_WORKER_ENABLED=true` and deploy the exact reviewed commit.
Enable one ordinary web-process worker. Confirm readiness, worker state, and a
bounded synthetic deletion before accepting the rollout.

## Rollback And Post-disable Drain

Set `DOCUMENT_ERASURE_WORKER_ENABLED=false` and redeploy. Wait for active leases
to expire before assessing the stable backlog. Database leases make interrupted
work reclaimable; do not edit attempts, leases, result codes, or queue state.

If operations explicitly approve post-disable processing, run one bounded cycle:

```bash
factory-careers operations document-erasure drain --yes --limit 10 --json
```

Review the fresh aggregate response before another drain. Stop on any failed
count, unexpected age growth, authorization failure, or non-sanitized output.

Legacy storage reconciliation is outside this rollout. Follow the separate
[reconciliation runbook](DOCUMENT-ERASURE-RECONCILIATION.md).
