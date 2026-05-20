# Factory Careers Fork

Factory Careers is a thin Factory-branded fork of Reqcore for `careers.thefactoryhq.com`.

## What This Fork Changes

- Brands the public job board, auth shell, dashboard chrome, email sender, and theme as Factory Careers.
- Keeps Reqcore's core ATS model intact: jobs, application questions, candidates, applications, pipeline statuses, interviews, private documents, source tracking, and dashboard workflows.
- Uses Microsoft SSO plus invitation/approval-gated dashboard access.
- Blocks public email/password sign-up and arbitrary organization creation by default.
- Seeds a single `Factory` organization and an open `General Interest` role via `npm run db:seed:factory`.
- Supports Supabase Storage S3 compatibility with `S3_FORCE_PATH_STYLE=true` and `S3_SKIP_BUCKET_POLICY=true`.
- Sends application receipt emails to candidates and hiring-team alerts to `FACTORY_CAREERS_HIRING_INBOX`.

## Render + Supabase Launch Vars

Required production shape:

```bash
BETTER_AUTH_URL=https://careers.thefactoryhq.com
BETTER_AUTH_SECRET=<32+ character random secret>
NUXT_PUBLIC_SITE_URL=https://careers.thefactoryhq.com
NUXT_PUBLIC_MARKETING_URL=https://thefactoryhq.com

DATABASE_URL=postgresql://...

S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=factory-careers-documents
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_SKIP_BUCKET_POLICY=true

FACTORY_ORG_NAME=Factory
FACTORY_ORG_SLUG=factory
FACTORY_ALLOWED_EMAIL_DOMAINS=thefactoryhq.com
FACTORY_CAREERS_HIRING_INBOX=careers@thefactoryhq.com
FACTORY_DISABLE_PUBLIC_SIGNUP=true
FACTORY_DISABLE_PUBLIC_ORG_CREATION=true

AUTH_MICROSOFT_CLIENT_ID=...
AUTH_MICROSOFT_CLIENT_SECRET=...
AUTH_MICROSOFT_TENANT_ID=...

RESEND_API_KEY=...
RESEND_FROM_EMAIL="Factory Careers <careers@thefactoryhq.com>"
```

After the first migration has run, seed launch content:

```bash
npm run db:seed:factory
```

Documents stay private. Candidate resumes are stored by server-side object keys and are only previewed/downloaded through authenticated dashboard routes.
