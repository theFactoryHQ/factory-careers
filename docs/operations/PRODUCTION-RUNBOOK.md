# Factory Careers Production Runbook

This runbook summarizes the checks and recovery paths for a production candidate release. It does not approve use with real candidate data by itself.

## Release Gate

Record these before deploying:

- Repository, branch, and commit SHA.
- Node version from `.nvmrc`.
- CI run URLs for PR validation, e2e, CodeQL, secret scan, release verification, and backup restore rehearsal.
- Completed production approval checklist.
- Completed retention and processor decisions.

## Environment

Production uses Render plus Supabase Postgres and Supabase Storage S3. Required values include:

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `NUXT_PUBLIC_SITE_URL`
- `NUXT_PUBLIC_MARKETING_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `AUTH_MICROSOFT_CLIENT_ID`
- `AUTH_MICROSOFT_CLIENT_SECRET`
- `AUTH_MICROSOFT_TENANT_ID`
- `SSO_PROVIDER_SECRET_STORAGE_MODE`
- `FACTORY_CAREERS_SSO_PROVIDER_ID`
- `CRON_SECRET`
- `FACTORY_CAREERS_OPERATIONS_INBOX`
- `FACTORY_CAREERS_HIRING_INBOX`
- `APPLICATION_NOTIFICATION_WORKER_ENABLED=true`

### Database migration invariant

`DATABASE_URL` must use the ordinary application role without DDL authority.
`DATABASE_MIGRATION_URL` must use a separate DDL-capable role. Production must
keep `SKIP_RUNTIME_MIGRATIONS=false`; startup rejects a skipped migration gate.

Before readiness succeeds, one reserved database session takes the advisory
lock, applies every bundled migration, and verifies both of these conditions:

- Every bundled migration timestamp and hash from the audited migration 0059
  reconciliation baseline forward exists in `drizzle.__drizzle_migrations`.
- Every table and column in the Drizzle runtime model exists in the live
  `public` schema.

Any migration, ledger, permission, or schema mismatch fails the new deploy.
Render must keep the last healthy deploy serving until the database gate passes.
Do not bypass readiness or point `DATABASE_MIGRATION_URL` at the application
role.

The inherited database predates complete Drizzle ledger tracking and contains
edited historical migration hashes. Migration 0059 establishes the audited
ledger baseline after those legacy entries. The modeled-schema inventory covers
the inherited tables and columns; the bidirectional timestamp-and-hash gate
covers every migration from 0059 forward. Do not move the baseline or add a
manual ledger entry without verifying the exact committed SQL outcome first.

For an incident, preserve the failed deploy logs and run the repository
migrator with the concealed migration-role URL:

```bash
DATABASE_URL="$DATABASE_MIGRATION_URL" npm run db:migrate
```

Redeploy the same reviewed commit. Confirm the startup log reports both
migrations and runtime schema verified. Then submit one synthetic application
through the public job form and confirm HTTP 201 plus its application,
response, and document records. Remove the synthetic record through the
supported administrative workflow after the proof is recorded.

`FACTORY_CAREERS_HIRING_INBOX` remains the fallback shared recipient when an
organization has not saved an inbox override. The default shared schedule is a
weekly Monday 09:00 digest in the organization email-workflow timezone; personal
notifications default to off. Only one application-notification worker should be
enabled per ordinary Render web process, although database leases and Resend
idempotency keys protect overlapping workers during deploys.

After deployment, verify that a newly inserted application creates one
`application_notification_event` row, progresses to recipient delivery/message
rows, and reaches `completed`. Do not manually backfill older applications.
Expected queue failures emit one of these structured events after the worker
owns and persists the corresponding row transition:

- `application_notification.event_retry_scheduled`
- `application_notification.event_failed`
- `application_notification.message_retry_scheduled`
- `application_notification.message_failed`

Their safe attributes are `org_id`, `queue_kind`, `record_id`, `attempt_count`,
`max_attempts`, sanitized `result_code`, and `retryable`; message events also
include `cadence` and `recipient_kind`. They never include recipient addresses,
candidate or application content, provider payloads, or raw exception text.
Retryable rows remain `pending` with backoff. Terminal rows remain `failed` for
incident review; leave those rows in place and do not edit queue state directly.

`application_notification_worker.cycle_failed` is reserved for an unexpected
exception that escapes an entire worker cycle. It is not emitted for each
provider or fanout failure handled by the durable queue.

Candidate acknowledgements and rejection emails use the same
`APPLICATION_NOTIFICATION_WORKER_ENABLED` runtime flag but a separate
`candidate_workflow_email_queue`. Both immediate and delayed sends are inserted
with the owning application or status transition, and Resend receives a stable
queue-row idempotency key. Inspect counts by state without selecting recipient
or template content:

```sql
SELECT purpose, status, count(*)
FROM candidate_workflow_email_queue
GROUP BY purpose, status
ORDER BY purpose, status;
```

Retry and terminal transitions emit
`candidate_workflow_email.retry_scheduled` and
`candidate_workflow_email.failed`. Their safe attributes are `org_id`,
`queue_id`, `purpose`, `attempt_count`, `max_attempts`, sanitized `result_code`,
and `retryable`. `candidate_workflow_email_worker.cycle_failed` indicates an
unexpected cycle-level exception. These events never contain candidate names,
addresses, template content, or raw provider errors. Leave failed rows in place
for incident review; do not manually alter attempts or leases.

## SSO Provider Secret Storage and Rollout

Organization OIDC client secrets in `sso_provider.oidc_config` use randomized
AES-256-GCM storage under a domain-separated key derived from
`BETTER_AUTH_SECRET`. Better Auth receives plaintext only in application memory.
Registration, management, readiness, health, CI, and monitoring responses must
never expose a credential value, stored configuration, token, provider
identifier, secret-derived identifier, or raw identity-provider response.

`SSO_PROVIDER_SECRET_STORAGE_MODE` has two values:

- `compatibility` reads plaintext or encrypted records, writes plaintext, and
  never runs the backfill. Use it only for the first mixed-version-safe release.
- `encrypted` reads either format, writes encrypted records, and runs the
  advisory-lock-protected backfill after a full read-only validation pass.

The repository default is `encrypted`. Factory production manages the value
explicitly in Render so a Blueprint sync cannot skip a rollout phase. Never
change directly from an old, plaintext-only runtime to `encrypted`.

Startup performs a bounded read-only validation before any provider mutation.
In encrypted mode, it validates, backfills under the migration session lock,
and validates again. `/api/readyz` stays unavailable until this completes. The
safe events are count-only:

- `sso_provider_secrets.validation_completed`
- `sso_provider_secrets.backfill_completed`
- `sso_provider_secrets.post_validation_completed`

Malformed JSON, an unsupported marker, an empty configured secret, corrupted
storage, or a mismatched `BETTER_AUTH_SECRET` fails startup closed with a generic
error and no pre-validation mutation. Do not bypass validation or edit stored
provider configuration manually.

### Compatibility-first production sequence

1. Set `SSO_PROVIDER_SECRET_STORAGE_MODE=compatibility` before the release can
   deploy.
2. Deploy the compatibility-capable runtime and prove readiness, the
   authenticated stable-code probe, and a real Microsoft sign-in to
   `/dashboard`.
3. Confirm with a metadata-only query that the provider remains plaintext and
   unmarked.
4. Rotate only the dedicated database application role's password. Do not
   rotate the owner or migration role.
5. Update Render's hidden database environment value and redeploy the same
   compatibility runtime.
6. Run one bounded rollback rehearsal to a pre-compatibility artifact. The old
   artifact must fail database readiness while Render keeps the current deploy
   serving.
7. Record the compatibility SHA and deploy ID as the minimum safe rollback
   target. Never roll back to an earlier artifact.
8. Set the mode to `encrypted`, deploy, require validation/backfill/post-
   validation success, and verify zero plaintext or invalid-marker records.
9. Repeat the real Microsoft sign-in. Rehearse rollback to the compatibility
   target; it must remain healthy because it reads both formats.

Use [SSO-RESILIENCE-ROLLOUT.md](SSO-RESILIENCE-ROLLOUT.md) for the exact
metadata-only count query, evidence ledger, rollback rules, and live proof
sequence.

### Microsoft credential health and rotation

`POST /api/operations/sso-health` requires `CRON_SECRET` and performs a real
Microsoft client-credential exchange with the configured Factory Careers SSO
provider. It returns only a stable code and checked timestamp. The GitHub
workflow calls it every 15 minutes. Invalid credentials, missing metadata, and
expiry thresholds alert immediately; transient failures require two fresh
probes. Operational email is state-transition based and repeated active-
incident alerts are rate-limited.

Non-secret key ID, activation, expiry, last-probe status, and last-success time
live in `sso_provider_credential_metadata`, scoped to the provider's
organization. The table must never contain a credential value, token, stored
provider configuration, or secret-derived identifier.

Rotate Microsoft credentials with overlap:

1. Create one replacement and preserve the predecessor.
2. Persist the concealed replacement in the canonical 1Password item.
3. Independently prove the stored replacement with a Microsoft token exchange.
4. Update Factory Careers through a supported secure boundary and upsert its
   non-secret key metadata.
5. Prove the stable health code, readiness, and a real Microsoft sign-in.
6. Remove the predecessor only after every replacement proof succeeds.

If secure persistence or independent verification fails, remove the unused
replacement and leave production on the verified predecessor.

`BETTER_AUTH_SECRET` rotation also invalidates other Better Auth state and
cannot decrypt existing SSO ciphertext. Before a planned rotation:

1. Confirm a non-SSO owner account can administer every affected organization.
2. Record each provider's non-secret settings and confirm its current client
   secret can be retrieved or replaced at the identity provider.
3. In a maintenance window, delete the SSO providers through the supported
   organization settings flow while the old application secret is active.
4. Rotate `BETTER_AUTH_SECRET`, redeploy, and re-register each provider from the
   identity provider's source credentials.
5. Re-run the count query and complete a real OIDC sign-in and callback smoke
   test before ending the maintenance window.

If the source credentials are unavailable, do not rotate the application
secret until each identity-provider credential has been replaced safely.

## Validation

```bash
npm run ops:validate-production-env -- <production-env-file>
npm run ops:backup-restore-rehearsal
npm run ops:object-storage-restore-rehearsal
```

## Incident Basics

- Treat suspected tenant-isolation or document-access bugs as security incidents.
- Disable affected public or dashboard flows through feature flags where possible.
- Preserve logs and deployment metadata before rollback.
- Prefer rollback to the last known-good commit/image when the blast radius is unclear.
- For failed public submissions, determine whether the transaction persisted an
  application before promising recovery. Request logs intentionally contain no
  form fields or document content; an attempt that failed before persistence
  requires the applicant to resubmit.
