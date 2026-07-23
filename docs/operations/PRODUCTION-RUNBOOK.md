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
