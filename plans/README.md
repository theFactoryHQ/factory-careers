# Implementation Plans

Generated and reconciled by the improve skill through 2026-08-23. Execute in
the order below unless dependencies say otherwise. Each executor: start from a
fresh branch based on current `origin/main`, read the plan fully, honor its STOP
conditions, and update the plan's row when done.

## Execution Order & Status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-rollback-public-application-document-limit.md) | Make public application document-limit failures rollback-safe | P1 | S | - | DONE |
| [002](002-require-content-length-for-multipart-uploads.md) | Require bounded multipart uploads before buffering | P1 | M | - | DONE |
| [004](004-resolve-high-critical-npm-audit.md) | Resolve high and critical npm audit advisories | P1 | M | - | DONE |
| [003](003-remove-public-demo-passcode-config.md) | Remove the public demo passcode runtime config | P2 | S | - | DONE |
| [005](005-enforce-migration-and-deployment-discipline.md) | Enforce migration and deployment discipline | P0 | L | 001-004 | DONE |
| [006](006-fail-closed-dependency-readiness.md) | Fail closed when production dependencies are unusable | P0 | L | 005 | DONE |
| [007](007-keep-public-job-pages-current.md) | Keep job listings and application forms current | P1 | M | 006 | DONE |
| [008](008-production-canaries-and-alerts.md) | Add production canaries and incident alerts | P0 | L | 005-007 | DONE |
| [009](009-encrypted-application-intake-recovery.md) | Add encrypted replayable submission recovery | P0 | XL | 005-008 | DONE |
| [010](010-atomic-scoring-criteria-replacement.md) | Make scoring-criteria replacement atomic | P0 | S | - | IN PROGRESS |
| [011](011-separate-instance-administration.md) | Separate instance administration from tenant ownership | P0 | M | - | IN PROGRESS |
| [012](012-require-postgres-integration-suites.md) | Require every PostgreSQL integration suite in PR CI | P0 | S | - | IN PROGRESS |
| [013](013-cover-critical-playwright-specs.md) | Cover every critical Playwright spec in required CI | P0 | S | - | IN PROGRESS |
| [014](014-restore-drizzle-snapshot-baseline.md) | Restore a current Drizzle snapshot baseline | P0 | M | - | DONE |
| [015](015-durable-private-document-erasure.md) | Make private-document erasure durable and truthful | P0 | L | 014 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale - finding fixed independently or approach
abandoned)

## Dependency Notes

- 001 and 002 are independent but both touch upload/application risk. If one
  executor owns both, run 001 first because it fixes persisted application data
  integrity before changing upload request admission.
- 004 is independent of the application/upload fixes. It has broad validation
  requirements because dependency updates can affect Nuxt, Nitro, Vite, Drizzle,
  and CLI behavior.
- 003 is independent and intentionally small.
- 005 through 009 are the completed reliability program on `origin/main`.
- 010 through 013 are independent, high-leverage fixes and may run in parallel
  in separate worktrees.
- 014 must land before 015 because 015 adds durable queue schema and must build
  on the repaired Drizzle metadata baseline.
- 015 should reuse the lease, retry, idempotency, and observability conventions
  established by the processing and email queues from plans 005-009.

## Findings Considered And Rejected

- Inactive source tracking links still redirect: rejected as a bug because
  `server/database/schema/app.ts` documents inactive tracking links as
  "deactivated links stop incrementing counts"; the current redirect-without-
  increment behavior matches that contract.
- Candidate document parsing failure cleanup: rejected as a high-priority bug
  because `server/utils/resume-parser.ts` treats parse failures as best-effort
  and returns `null`, so parser failures do not currently strand S3 objects or
  block document upload.
- Dashboard list performance: rejected for this planning batch because recent
  code already uses pagination, `Promise.all`, cached handlers, and bulk custom
  property loading in the audited dashboard list/stat paths. No high-confidence
  performance defect was found in the standard pass.
- Broad Supabase/RLS remediation: rejected because the application uses direct
  server-side PostgreSQL and has no Supabase client or Data API surface.
- E2E job consolidation: deferred until CI timing evidence shows which setup
  work dominates and which suites can safely share state.
- Inactive source-link redirects: retained because the documented contract says
  deactivation stops counting; it does not disable redirection.
