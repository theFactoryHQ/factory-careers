# Public application migration drift — 2026-08-14

## Impact

The Manager, Accounting public application endpoint returned HTTP 500 when a
candidate submitted the form. Production request logs contain 21 genuine failed
attempts on August 14 after excluding four controlled diagnostic requests.
Repeated attempts may belong to the same person, so this is an attempt count,
not a confirmed unique-applicant count.

## Root cause

The deployed application referenced committed database changes that had not
been applied to production. The first observed failure was the missing
`org_settings.send_application_acknowledgement` column. After that migration was
applied in isolation, startup reached another missing object,
`candidate_workflow_email_queue`.

The production service had `SKIP_RUNTIME_MIGRATIONS=true`. Its ordinary
`DATABASE_URL` role could not apply DDL, while the DDL-capable migration URL was
not part of the runtime contract. Startup logging could also report migration
success after taking the skip path. These conditions allowed application code
and the live schema to drift.

## Recovery

The full committed migration journal was applied with the dedicated migration
role. Two controlled synthetic Manager, Accounting submissions then returned
HTTP 201 and persisted their application, response, and document records.

The genuine failed submissions cannot be reconstructed from production. The
failure occurred before the application transaction and document upload, so no
candidate, application, response, or resume record was saved. Render request
logs intentionally preserve request metadata without the submitted form fields
or file body. Affected applicants must submit the form again.

## Permanent controls

- Production requires a distinct `DATABASE_MIGRATION_URL` and rejects skipped
  runtime migrations.
- Startup serializes migration work with an advisory lock.
- Startup compares every bundled migration timestamp and hash with the Drizzle
  migration ledger.
- Startup compares every modeled table and column with the live public schema.
- Readiness remains failed until migration, ledger, schema, and SSO storage
  checks all pass.
- The production environment preflight and release checklist enforce the same
  role and skip-setting requirements.
- Release proof includes a synthetic public application with persisted response
  and document records.
