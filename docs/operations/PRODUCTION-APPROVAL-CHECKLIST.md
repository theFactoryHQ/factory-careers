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
| SSO storage validation | Pass before any backfill |  |
| `SSO_PROVIDER_SECRET_STORAGE_MODE` | Explicitly matches the approved rollout phase |  |
| SSO credential metadata | Key ID, activation, expiry, and last success present; no secret fields |  |
| Authenticated Microsoft probe | Stable healthy code; no raw provider data |  |
| Real Microsoft sign-in | Reaches `/dashboard` |  |
| Instance administrator bootstrap | One exact Better Auth user ID configured; `system info` returns `canAdministerInstance: true` |  |
| Tenant-owner host denial | Non-allowlisted owner receives HTTP 403 for update and backup before host work |  |
| Minimum safe rollback target | Compatibility-capable SHA and Render deploy recorded |  |
| Historical-artifact rollback rehearsal | Old artifact fails readiness; current deploy remains live |  |
| SSO monitor | Manual run healthy and 15-minute schedule enabled |  |
| Public-path monitor | All four probes healthy; five-minute schedule enabled |  |
| Application canary | Exact-deploy and daily workflows healthy; zero residue |  |
| Canary notification suppression | No candidate or internal email emitted |  |
| Render exact-commit poll | Live commit equals gated commit before canary |  |
| Intake recovery staged rollout | Disabled deploy healthy; keyring configured; enabled deploy healthy |  |
| Intake encryption proof | Tamper, wrong-key, rotation, and no-plaintext tests pass |  |
| Delayed submission drill | Forced downstream failure returns 202; replay succeeds; zero residue |  |
| Recovery expiry | Seven-day purge and retired-key retention verified |  |
| `npm run ops:validate-production-env -- <env-file>` | Pass against exact production values |  |
| Database roles | `DATABASE_URL` is app-only; `DATABASE_MIGRATION_URL` is a distinct DDL role |  |
| Runtime migration setting | `SKIP_RUNTIME_MIGRATIONS=false` |  |
| Migration startup gate | Bundled migration ledger and modeled schema verification pass |  |
| Synthetic public application | HTTP 201 with application, response, and document records |  |
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
