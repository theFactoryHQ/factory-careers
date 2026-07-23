# Security Testing Notes

The old upstream security test plan has been replaced by executable tests and CI workflows. Use this file as a map to the current evidence.

## Core Coverage

| Area | Evidence |
| --- | --- |
| Route auth and org scoping | `tests/unit/security-route-coverage.test.ts` |
| Permission boundaries | `tests/unit/require-permission-security.test.ts`, `tests/unit/rbac-matrix.test.ts` |
| Auth hardening | `tests/unit/auth-security-hardening.test.ts`, `tests/unit/security-fixes.test.ts` |
| SSO safety | `tests/unit/sso-*.test.ts`, `tests/unit/safe-outbound-fetch.test.ts` |
| Custom AI outbound safety | `tests/unit/ai-provider-safe-fetch.test.ts`, `tests/unit/ai-model-catalog.test.ts` |
| Tenant isolation | `e2e/security/tenant-isolation.spec.ts` |
| E2E harness contract | `tests/unit/e2e-harness-contract.test.ts` |

## Outbound Request Binding Boundary

Factory Careers resolves every address for an application-owned OIDC discovery
or organization-configured custom AI request, rejects the whole DNS answer set
when any address is unsafe, and binds that request's isolated dispatcher to the
validated addresses. Redirects are rejected, while the original hostname stays
in the URL for HTTP Host, TLS certificate verification, and SNI.

The Better Auth enterprise SSO callback still owns its later token, user-info,
and JWKS requests. The installed plugin does not expose a supported per-request
fetch hook for those calls. Do not work around that boundary with a global
dispatcher or a dependency patch; reassess the integration when Better Auth
adds callback-level fetch injection.

## Commands

```bash
npm run test:unit
npm run test:e2e:security:core
npm run test:e2e:security:extended
```

For production launch evidence, use the operations docs in `docs/operations/`.
