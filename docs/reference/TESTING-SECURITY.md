# Security Testing Notes

The old upstream security test plan has been replaced by executable tests and CI workflows. Use this file as a map to the current evidence.

## Core Coverage

| Area | Evidence |
| --- | --- |
| Route auth and org scoping | `tests/unit/security-route-coverage.test.ts` |
| Permission boundaries | `tests/unit/require-permission-security.test.ts`, `tests/unit/rbac-matrix.test.ts` |
| Auth hardening | `tests/unit/auth-security-hardening.test.ts`, `tests/unit/security-fixes.test.ts` |
| SSO safety | `tests/unit/sso-*.test.ts` |
| Tenant isolation | `e2e/security/tenant-isolation.spec.ts` |
| E2E harness contract | `tests/unit/e2e-harness-contract.test.ts` |

## Commands

```bash
npm run test:unit
npm run test:e2e:security:core
npm run test:e2e:security:extended
```

For production launch evidence, use the operations docs in `docs/operations/`.

