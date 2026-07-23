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
- `FACTORY_CAREERS_HIRING_INBOX`
- `APPLICATION_NOTIFICATION_WORKER_ENABLED=true`

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

## SSO Provider Secret Encryption

Organization OIDC client secrets in `sso_provider.oidc_config` are encrypted
with randomized AES-256-GCM ciphertext under a domain-separated key derived from
`BETTER_AUTH_SECRET`. Better Auth receives the plaintext only after the database
adapter decrypts a provider in memory. Registration and management responses
must expose neither the plaintext nor the stored ciphertext.

Every runtime startup runs an idempotent, 100-row paginated backfill after
schema migrations while holding PostgreSQL advisory locks. Wait for
`sso_provider_secrets.backfill_completed` before completing a rollout. Its
attributes contain counts only: `scanned_count`, `encrypted_count`,
`already_encrypted_count`, and `without_client_secret_count`.

Verify completion without selecting credential values:

```sql
SELECT
  count(*) FILTER (
    WHERE oidc_config::jsonb ? 'clientSecret'
  ) AS providers_with_client_secrets,
  count(*) FILTER (
    WHERE oidc_config::jsonb ->> '_factoryCareersClientSecretEncryption' = 'v1'
  ) AS encrypted_client_secrets
FROM sso_provider
WHERE oidc_config IS NOT NULL;
```

The two counts must match. Do not select, copy, or log `clientSecret` values.
Malformed configuration, corrupted ciphertext, or a mismatched
`BETTER_AUTH_SECRET` fails startup closed with `migrations.failed`; never bypass
the backfill or edit ciphertext manually. Restore the prior application secret
and redeploy before investigating provider-by-provider.

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
