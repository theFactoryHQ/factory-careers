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

