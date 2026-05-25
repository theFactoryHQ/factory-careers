# Factory Careers Production Readiness

Factory Careers requires explicit approval before storing real candidate data.

## Current Launch Criteria

- Required CI checks pass on the exact candidate commit.
- Production environment values pass `npm run ops:validate-production-env`.
- Database and object-storage backup/restore rehearsals pass.
- Tenant isolation and RBAC checks pass against a production build.
- Security policy, incident path, and data-retention decisions are current.
- AGPL obligations and third-party processor approvals are reviewed.

## Required Commands

```bash
npm ci
npm run test:unit
npm run typecheck
npm run build
npm audit --audit-level=high
npm run ops:validate-production-env -- <production-env-file>
npm run ops:backup-restore-rehearsal
npm run ops:object-storage-restore-rehearsal
npm run test:e2e
```

Attach command output or CI links to `docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md`.

