# Factory Careers Production Approval Checklist

Use this checklist before launching or materially changing any environment that stores real candidate data.

## Release Candidate

| Field | Value |
| --- | --- |
| Repository | `theFactoryHQ/factory-careers` |
| Branch |  |
| Commit SHA |  |
| Release tag or image digest |  |
| Node version |  |
| Assessment date |  |
| Approver |  |

## Required Evidence

| Evidence | Required Result | Link or Notes |
| --- | --- | --- |
| `npm ci` | Pass |  |
| `npm run test:unit` | Pass |  |
| `npm run typecheck` | Pass or documented non-blocking warning |  |
| `npm run build` | Pass |  |
| `npm audit --audit-level=high` | 0 high/critical vulnerabilities |  |
| Secret scan | No unresolved secrets |  |
| CodeQL | No unresolved high-severity findings |  |
| Playwright e2e | Pass against production build with synthetic data |  |
| Tenant isolation checks | Pass |  |
| `npm run ops:validate-production-env -- <env-file>` | Pass against exact production values |  |
| `npm run ops:backup-restore-rehearsal` | Pass |  |
| `npm run ops:object-storage-restore-rehearsal` | Pass |  |

## Sign-Off Areas

| Area | Owner | Status | Notes |
| --- | --- | --- | --- |
| Engineering |  |  |  |
| Security |  |  |  |
| Privacy/legal |  |  |  |
| Operations |  |  |  |
| Data processors |  |  |  |

