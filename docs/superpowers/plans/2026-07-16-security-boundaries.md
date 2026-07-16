# Security Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every sensitive request is authorized at request time and remove four adjacent cross-tenant, privacy, denial-of-service, and secret-logging risks.

**Architecture:** Route handlers authorize first and call organization-scoped cached functions second. Compliance aggregation, calendar maintenance, and analytics proxy validation use small testable server utilities so the security policy is explicit and behaviorally covered.

**Tech Stack:** Nuxt 4, Nitro/h3, TypeScript, Drizzle ORM, Vitest.

---

### Task 1: Put authorization outside dashboard data caches

**Files:**
- Modify: `server/utils/httpCache.ts`
- Modify: `server/api/{jobs,candidates,applications,interviews}/index.get.ts`
- Modify: `server/api/dashboard/stats.get.ts`
- Test: `tests/unit/list-api-cache.test.ts`

- [ ] Write a failing test that rejects `defineCachedEventHandler` on authenticated routes and requires `requirePermission` before an organization-scoped cached function call.
- [ ] Run `npm run test:unit -- tests/unit/list-api-cache.test.ts`; expect the current cached handlers to fail.
- [ ] Export a typed helper with this contract:

```ts
export function defineOrgScopedCachedFunction<TInput, TResult>(
  name: string,
  loader: (organizationId: string, input: TInput) => Promise<TResult>,
) {
  return defineCachedFunction(loader, {
    name,
    maxAge: ORG_SCOPED_CACHE_MAX_AGE_SECONDS,
    swr: true,
    getKey: async (organizationId, input) =>
      `${escapeCacheKeyPart(organizationId)}:v${await getOrgDashboardCacheVersion(organizationId)}:${hash(input)}`,
  })
}
```

- [ ] Convert each route to `defineEventHandler`, run `requirePermission`, validate its query, then call its module-level cached data function with the authorized org ID.
- [ ] Run the focused test and `npm run typecheck`; expect both to pass.
- [ ] Commit with `fix: authorize dashboard reads before cache lookup`.

### Task 2: Restrict and suppress compliance reporting

**Files:**
- Create: `server/utils/complianceReporting.ts`
- Modify: `server/api/compliance/applications/summary.get.ts`
- Test: `tests/unit/compliance-reporting.test.ts`

- [ ] Write failing tests for totals below five and cells below five.
- [ ] Implement `suppressComplianceBreakdown(rows, total)` returning no breakdowns below the cohort threshold and replacing small cells with `{ value: 'suppressed', count: null }`.
- [ ] Require `{ organization: ['update'] }` instead of ordinary application-read permission.
- [ ] Run the focused tests; expect pass.
- [ ] Commit with `fix: protect small-cohort compliance reporting`.

### Task 3: Separate global cron renewal from organization-scoped renewal

**Files:**
- Modify: `server/api/calendar/renew-webhooks.post.ts`
- Test: `tests/unit/calendar-renewal-scope.test.ts`

- [ ] Write failing tests proving a configured, timing-safe cron secret can renew globally while an interactive administrator can renew only integrations whose `organizationId` matches the active organization.
- [ ] Keep global renewal behavior only after valid cron-secret verification. Reject an invalid supplied secret before any integration query.
- [ ] Preserve the supported CLI path by requiring `{ organization: ['update'] }` when no cron secret is supplied and adding `eq(calendarIntegration.organizationId, orgId)` to that branch.
- [ ] Run the focused test; expect pass.
- [ ] Commit with `fix: scope interactive calendar renewal by organization`.

### Task 4: Bound the public analytics proxy

**Files:**
- Create: `server/utils/analyticsProxyPolicy.ts`
- Modify: `server/routes/ingest/[...path].ts`
- Test: `tests/unit/analytics-proxy-policy.test.ts`

- [ ] Write failing tests for unsupported methods, unknown paths, missing/oversized content lengths, and oversized streamed bodies.
- [ ] Implement explicit capture/static path allowlists, `GET|HEAD|POST` methods, a 1 MiB request maximum, a 2 MiB response maximum, and route-specific rate limiting.
- [ ] Stream or size-check upstream response reads before allocating the final buffer.
- [ ] Run focused tests; expect pass.
- [ ] Commit with `fix: bound public analytics proxy traffic`.

### Task 5: Remove raw connection strings from errors

**Files:**
- Modify: `drizzle.config.ts`
- Test: `tests/unit/drizzle-config-secrets.test.ts`

- [ ] Write a failing source-contract test asserting the error does not interpolate `raw`.
- [ ] Replace the message with a diagnostic that names only missing variable categories.
- [ ] Run the focused test; expect pass.
- [ ] Commit with `fix: prevent database URL disclosure in errors`.

### Task 6: Validate the security PR

- [ ] Run `npm run test:unit` and expect 0 failures.
- [ ] Run `npm run check:conventions`, `npm run typecheck`, and `npm run build`; expect exit 0.
- [ ] Run `npm run preflight:pr`; expect exit 0.
- [ ] Request spec review, then code-quality review; resolve every Critical or Important issue and re-run affected checks.
