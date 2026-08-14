# 008 — Production Canaries and Alerts

Status: DONE

## Outcome

Public paths are checked every five minutes. Exact-deploy and daily canaries
exercise the complete General Interest application workflow, suppress every
notification, and leave no database, queue, candidate, or storage residue.

## Implementation

- External monitoring checks readiness, jobs API, General Interest apply, and
  FactoryHQ careers pages twice before incident creation.
- A cron-authenticated canary builds required answers and submits a synthetic
  PDF through the public application route.
- Transaction-local database state suppresses notification triggers. Candidate
  email and scoring are also disabled for the synthetic request.
- Cleanup runs in the public handler and again at the operations boundary.
- Render is polled until the exact gated SHA is live before the post-deploy run.
- GitHub incidents deduplicate and close on recovery. Critical operational
  email is rate limited and contains no applicant data or raw errors.

## Proof

Tests cover authentication, normal-path coverage, suppression, cleanup,
workflow structure, incident recovery, and PII-free alert payloads.
