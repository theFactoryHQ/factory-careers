# Reqcore Production Approval Checklist

This checklist is the sign-off artifact for any launch that may contain real
candidate data. It complements `PRODUCTION-READINESS.md` and
`PRODUCTION-RUNBOOK.md`; it does not replace legal, privacy, or security review.

## Release Candidate

| Field | Value |
|---|---|
| Repository |  |
| Branch |  |
| Commit SHA |  |
| Release tag or image digest |  |
| Node version |  |
| Assessment date |  |
| Approver |  |

## Required Evidence

Attach command output or CI run links for each item.

| Evidence | Required Result | Link or Notes |
|---|---|---|
| `npm ci` | Pass |  |
| `npm run test:unit` | Pass |  |
| `npm run typecheck` | Pass or documented non-blocking warning |  |
| `npm run build` | Pass |  |
| `npm audit --audit-level=high` | 0 high/critical vulnerabilities |  |
| Gitleaks full-history scan | No leaks, or rotated/remediated leaks |  |
| CodeQL | No unresolved high-severity findings |  |
| Playwright e2e | Pass against production build with synthetic data |  |
| Tenant isolation spot checks | Pass |  |
| RBAC spot checks | Pass |  |
| `npm run ops:validate-production-env -- <env-file>` | Pass against exact production values |  |
| `npm run ops:backup-restore-rehearsal` | Pass |  |
| `npm run ops:object-storage-restore-rehearsal` | Pass |  |
| Sanitized database restore rehearsal | Pass against production-like backup |  |
| Sanitized object storage restore rehearsal | Pass against production-like backup |  |

## Required Approvals

| Area | Owner | Status | Notes |
|---|---|---|---|
| Engineering |  | Not started | Runtime, deployment, rollback, CI, monitoring. |
| Security |  | Not started | Auth, RBAC, tenant isolation, secrets, incident path. |
| Legal/license |  | Not started | AGPL-3.0 obligations and proprietary workflow impact. |
| Privacy/data protection |  | Not started | Candidate PII, processors, retention, deletion, regions. |
| Operations |  | Not started | Backups, restore, alerts, credentials, on-call owner. |

Use these status values: `Not started`, `In review`, `Approved`, `Rejected`,
`Approved with conditions`.

## AGPL-3.0 Review

Reqcore is AGPL-3.0 licensed. Legal approval is required before a production
hosted deployment, especially if the deployment is modified or integrated with
private systems.

| Question | Decision | Notes |
|---|---|---|
| Will users interact with a modified version over a network? |  |  |
| If yes, how will corresponding source be offered to users? |  |  |
| Are proprietary integrations, plugins, or private patches included? |  |  |
| Are legal notices and license links visible and preserved? |  |  |
| Is the deployment model internal-only, customer-facing, or public? |  |  |
| Who owns ongoing AGPL compliance for this fork? |  |  |
| Legal sign-off date |  |  |

## Data Processor Register

Fill out every enabled service before real candidate data is loaded. If a
service is disabled, mark it `Disabled` and leave processor review notes.

| Service | Enabled? | Candidate Data Sent? | Region | DPA/Contract | Retention | Approval |
|---|---|---|---|---|---|---|
| PostgreSQL hosting |  | Yes |  |  |  |  |
| S3/MinIO/object storage |  | Yes, documents |  |  |  |  |
| SMTP provider |  | Names/emails/interview metadata |  |  |  |  |
| Resend |  | Names/emails/interview metadata |  |  |  |  |
| OpenAI |  | Resume/job/application content if enabled |  |  |  |  |
| Anthropic |  | Resume/job/application content if enabled |  |  |  |  |
| Google AI |  | Resume/job/application content if enabled |  |  |  |  |
| OpenAI-compatible AI provider |  | Depends on provider |  |  |  |  |
| PostHog |  | Product analytics; review identity fields |  |  |  |  |
| Google Calendar |  | Interview metadata and attendee emails |  |  |  |  |
| Google social sign-in |  | Auth identity metadata |  |  |  |  |
| GitHub social sign-in |  | Auth identity metadata |  |  |  |  |
| Microsoft social sign-in |  | Auth identity metadata |  |  |  |  |
| OIDC SSO provider |  | Auth identity metadata |  |  |  |  |
| GitHub feedback issues |  | User-submitted feedback, optional screenshots |  |  |  |  |

## Go/No-Go Decision

Do not approve real candidate data unless all P0 blockers in
`PRODUCTION-READINESS.md` are closed or explicitly accepted by the accountable
owner.

| Decision | Owner | Date | Conditions |
|---|---|---|---|
| Not approved / Approved for synthetic data only / Approved pilot / Approved production |  |  |  |
