# Factory Careers SSO Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Factory Careers Microsoft SSO safe across mixed-version deploys and rollbacks, proactively detect invalid or expiring credentials, and complete a production rollout with live login and rollback evidence.

**Architecture:** Extend the existing Better Auth SSO storage boundary with explicit `compatibility` and `encrypted` modes. Validate every stored provider secret before any mutation, surface that state through readiness, and add a CRON-secret-protected Microsoft client-credential probe backed by non-secret, organization-scoped health metadata. Deploy compatibility first, fence old Render artifacts by rotating the database app-role password, activate encryption, then rotate the Microsoft credential with overlap and readback proof.

**Tech Stack:** Nuxt 4/Nitro, TypeScript, Better Auth, Drizzle ORM, PostgreSQL, Vitest, Playwright, GitHub Actions, Render, Microsoft Entra ID, Supabase, 1Password.

---

## Task 1: Add explicit storage-mode behavior

**Files:**

- Modify: `server/utils/ssoProviderSecrets.ts`
- Modify: `server/utils/auth.ts`
- Modify: `server/utils/env.ts`
- Modify: `scripts/validate-production-env.mjs`
- Modify: `tests/unit/sso-provider-secrets.test.ts`
- Modify: `tests/unit/sso-env-extended.test.ts`
- Modify: `tests/unit/production-env-validation.test.ts`

- [ ] Write failing adapter tests for both modes.

  Add cases proving:

  - `compatibility` reads plaintext and encrypted rows;
  - `compatibility` writes plaintext and strips `_factoryCareersClientSecretEncryption`;
  - `encrypted` reads both formats and writes `fc-sso:v1:` ciphertext;
  - unsupported modes fail environment parsing.

- [ ] Run the focused tests and confirm the expected failures.

  ```bash
  npm run test:unit -- tests/unit/sso-provider-secrets.test.ts tests/unit/sso-env-extended.test.ts tests/unit/production-env-validation.test.ts
  ```

- [ ] Add the mode type and normalization path.

  In `server/utils/ssoProviderSecrets.ts`, export:

  ```ts
  export type SsoProviderSecretStorageMode = 'compatibility' | 'encrypted'
  ```

  Extend record transformation so writes call a mode-aware function:

  ```ts
  export function prepareSsoProviderRecordForStorage<T>(
    record: T,
    secret: string,
    mode: SsoProviderSecretStorageMode,
  ): T
  ```

  `compatibility` must reveal encrypted input, serialize plaintext, and remove the marker. `encrypted` must preserve valid ciphertext or encrypt plaintext. Both read paths continue to use `revealSsoProviderRecord`.

- [ ] Pass the mode through `wrapSsoProviderSecretAdapter` and `server/utils/auth.ts`.

  The wrapper signature becomes:

  ```ts
  wrapSsoProviderSecretAdapter(adapterFactory, env.BETTER_AUTH_SECRET, env.SSO_PROVIDER_SECRET_STORAGE_MODE)
  ```

- [ ] Add environment contracts.

  Add `SSO_PROVIDER_SECRET_STORAGE_MODE` to `envSchema` as `z.enum(['compatibility', 'encrypted']).default('encrypted')`. Add the same validation to `validate-production-env.mjs`, with `encrypted` as the absence/default behavior and a hard error for any other non-empty value.

- [ ] Run the focused tests and confirm they pass.

  ```bash
  npm run test:unit -- tests/unit/sso-provider-secrets.test.ts tests/unit/sso-env-extended.test.ts tests/unit/production-env-validation.test.ts
  ```

- [ ] Commit the storage-mode slice.

  ```bash
  git add server/utils/ssoProviderSecrets.ts server/utils/auth.ts server/utils/env.ts scripts/validate-production-env.mjs tests/unit/sso-provider-secrets.test.ts tests/unit/sso-env-extended.test.ts tests/unit/production-env-validation.test.ts
  git commit --no-verify -m "fix: make SSO secret storage rollout explicit"
  ```

## Task 2: Validate storage before mutation and gate readiness

**Files:**

- Create: `server/utils/ssoReadiness.ts`
- Modify: `server/utils/ssoProviderSecrets.ts`
- Modify: `server/plugins/migrations.ts`
- Modify: `server/api/readyz.get.ts`
- Modify: `tests/unit/sso-provider-secrets.test.ts`
- Modify: `tests/integration/sso-provider-secrets.pg.test.ts`
- Modify: `tests/unit/migration-locking.test.ts`
- Create: `tests/unit/sso-readiness.test.ts`

- [ ] Write failing validation and readiness tests.

  Cover malformed JSON, empty plaintext, unsupported marker, wrong-key ciphertext, validation-before-backfill ordering, no mutation on validation failure, and 503 readiness before SSO validation.

- [ ] Run the focused tests and confirm failures.

  ```bash
  npm run test:unit -- tests/unit/sso-provider-secrets.test.ts tests/unit/migration-locking.test.ts tests/unit/sso-readiness.test.ts
  ```

- [ ] Extract bounded read-only validation.

  Export from `server/utils/ssoProviderSecrets.ts`:

  ```ts
  export type SsoProviderSecretValidationResult = {
    scanned: number
    plaintext: number
    encrypted: number
    withoutClientSecret: number
  }

  export async function validateSsoProviderClientSecrets(
    sql: Sql,
    secret: string,
    options?: { batchSize?: number },
  ): Promise<SsoProviderSecretValidationResult>
  ```

  The function uses ordered, bounded pages and never issues an update. It rejects empty secrets and validates/decrypts marked ciphertext with `SsoProviderSecretError`.

- [ ] Add in-process readiness state.

  `server/utils/ssoReadiness.ts` exposes reset, ready, failed, and snapshot functions. The public snapshot only contains `{ ready: boolean }`; internal error details must not be returned by `/api/readyz`.

- [ ] Change startup ordering.

  In the existing reserved migration session:

  1. reset SSO readiness;
  2. run schema migrations;
  3. run read-only secret validation;
  4. if mode is `encrypted`, run backfill then validate again;
  5. mark SSO ready;
  6. on any failure mark failed and rethrow the sanitized error.

  In `compatibility`, do not call the backfill.

- [ ] Gate `/api/readyz` on both database and SSO readiness.

  Preserve the successful response exactly as `{ ok: true }` and return only generic 503 status messages.

- [ ] Run unit and PostgreSQL integration tests.

  ```bash
  npm run test:unit -- tests/unit/sso-provider-secrets.test.ts tests/unit/migration-locking.test.ts tests/unit/sso-readiness.test.ts
  npm run test:unit -- tests/integration/sso-provider-secrets.pg.test.ts
  ```

  If the PostgreSQL URL is unavailable locally, record the skip and rely on the existing CI PostgreSQL lane before merge.

- [ ] Commit validation and readiness.

  ```bash
  git add server/utils/ssoProviderSecrets.ts server/utils/ssoReadiness.ts server/plugins/migrations.ts server/api/readyz.get.ts tests/unit/sso-provider-secrets.test.ts tests/integration/sso-provider-secrets.pg.test.ts tests/unit/migration-locking.test.ts tests/unit/sso-readiness.test.ts
  git commit --no-verify -m "fix: fail closed before SSO storage migration"
  ```

## Task 3: Add non-secret Microsoft credential metadata

**Files:**

- Modify: `server/database/schema/sso.ts`
- Create: `server/database/migrations/0063_sso_credential_health.sql`
- Modify: `server/database/migrations/meta/_journal.json`
- Create: `tests/unit/sso-credential-metadata-schema.test.ts`
- Modify: `tests/integration/sso-provider-secrets.pg.test.ts`

- [ ] Write failing schema and integration assertions.

  Assert an organization-scoped table with no column whose name contains `secret`, `token`, `ciphertext`, `fingerprint`, or `credential_value`. Assert provider and organization foreign keys and one row per provider.

- [ ] Add `ssoProviderCredentialMetadata` to `server/database/schema/sso.ts`.

  Use these fields:

  - `id` text primary key;
  - `ssoProviderId` text, unique, cascading FK to `sso_provider.id`;
  - `organizationId` text, cascading FK to `organization.id`;
  - `credentialKeyId` text;
  - `activatedAt`, `expiresAt`, `lastSuccessfulProbeAt`, `lastProbedAt`, `lastAlertedAt` timestamptz;
  - `lastProbeStatus` text;
  - `consecutiveTransientFailures` integer default 0;
  - `createdAt`, `updatedAt` timestamptz.

  Add organization and expiry indexes and relations.

- [ ] Add migration `0063_sso_credential_health.sql` and journal entry index 63.

  Enable RLS and add the existing server-role full-access policy used by operational tables. Use a check constraint to prevent a negative transient-failure count.

- [ ] Run focused tests.

  ```bash
  npm run test:unit -- tests/unit/sso-credential-metadata-schema.test.ts tests/integration/sso-provider-secrets.pg.test.ts
  ```

- [ ] Commit the metadata schema.

  ```bash
  git add server/database/schema/sso.ts server/database/migrations/0063_sso_credential_health.sql server/database/migrations/meta/_journal.json tests/unit/sso-credential-metadata-schema.test.ts tests/integration/sso-provider-secrets.pg.test.ts
  git commit --no-verify -m "feat: track non-secret SSO credential health"
  ```

## Task 4: Add the sanitized Microsoft health probe

**Files:**

- Create: `server/utils/microsoftSsoHealth.ts`
- Create: `server/api/operations/sso-health.post.ts`
- Create: `tests/unit/microsoft-sso-health.test.ts`
- Create: `tests/unit/sso-health-route.test.ts`
- Modify: `tests/unit/security-route-coverage.test.ts`

- [ ] Write failing utility and route tests.

  Test:

  - valid client-credential exchange maps to `healthy`;
  - `invalid_client` maps to `invalid_client` without returning raw descriptions;
  - timeouts and 5xx map to `transient_failure`;
  - missing provider/metadata and expiry thresholds map to stable codes;
  - output contains no provider ID, organization ID, tenant ID, client ID, secret, ciphertext, access token, fingerprint, or raw response;
  - missing/invalid `x-cron-secret` is rejected;
  - repeated calls inside the TTL reuse the cached result.

- [ ] Implement `probeMicrosoftSsoCredential` with dependency injection.

  Load the configured provider row, reveal its OIDC config with the existing helper, validate the configured token endpoint with the existing safe-server-side URL boundary, and POST URL-encoded `client_credentials` with `scope=https://graph.microsoft.com/.default`. Use a 10-second abort timeout.

  Return only:

  ```ts
  type MicrosoftSsoHealthResponse = {
    ok: boolean
    code: 'healthy' | 'invalid_client' | 'transient_failure' | 'metadata_missing' | 'expires_30d' | 'expires_14d' | 'expires_7d' | 'expired'
    checkedAt: string
  }
  ```

  Never include `error_description`, raw JSON, identifiers, or secret-derived values in the result or log fields.

- [ ] Implement `POST /api/operations/sso-health`.

  Require `x-cron-secret` with `timingSafeStringEqual`; there is no interactive user fallback. Add `Cache-Control: no-store`. Use a 5-minute in-process cache and expose a test reset helper. Persist only non-secret health state to `sso_provider_credential_metadata`.

- [ ] Run focused tests.

  ```bash
  npm run test:unit -- tests/unit/microsoft-sso-health.test.ts tests/unit/sso-health-route.test.ts tests/unit/security-route-coverage.test.ts
  ```

- [ ] Commit the probe.

  ```bash
  git add server/utils/microsoftSsoHealth.ts server/api/operations/sso-health.post.ts tests/unit/microsoft-sso-health.test.ts tests/unit/sso-health-route.test.ts tests/unit/security-route-coverage.test.ts
  git commit --no-verify -m "feat: add sanitized Microsoft SSO health probe"
  ```

## Task 5: Add state-transition email and GitHub incident monitoring

**Files:**

- Modify: `server/lib/email/templates.tsx`
- Modify: `server/utils/email.ts`
- Modify: `server/utils/env.ts`
- Modify: `render.yaml`
- Create: `.github/workflows/sso-health-monitor.yml`
- Create: `tests/unit/sso-health-alerting.test.ts`
- Create: `tests/unit/sso-health-monitor-workflow.test.ts`
- Modify: `tests/unit/render-blueprint.test.ts`
- Modify: `tests/unit/application-email-branding.test.ts`

- [ ] Write failing alerting, workflow, and Render contract tests.

  Assert:

  - email fires once when health changes from healthy to unhealthy;
  - repeat unhealthy probes inside 24 hours do not resend;
  - recovery resets the transition state;
  - workflow runs every 15 minutes and accepts manual dispatch;
  - immediate codes create/update one incident issue on the first failure;
  - transient failure is retried after 60 seconds and creates/updates the issue only after the second failure;
  - issue body and action logs never print the route response body or secrets;
  - Render declares `CRON_SECRET`, `FACTORY_CAREERS_OPERATIONS_INBOX`, and encrypted storage as production-managed environment variables.

- [ ] Add `OperationalAlertEmail` and `sendSsoOperationalAlertEmail`.

  The subject and body identify Factory Careers SSO as unhealthy and show only the stable code and checked timestamp. Send to `FACTORY_CAREERS_OPERATIONS_INBOX`; do not fall back to a public or candidate address.

- [ ] Add state-transition/rate-limit logic in the probe persistence path.

  Update health metadata transactionally. Send email only after a committed healthy-to-unhealthy transition or after 24 hours of continued unhealthy state. A recovered state clears the failure count and permits a future transition alert.

- [ ] Add `.github/workflows/sso-health-monitor.yml`.

  Use `schedule: '*/15 * * * *'`, `workflow_dispatch`, `permissions: issues: write`, and repository secrets `FACTORY_CAREERS_PRODUCTION_URL` plus `FACTORY_CAREERS_CRON_SECRET`. Normalize the HTTP status and stable code without echoing the response. Use `actions/github-script` to find/create/update one open issue labeled `incident:sso`.

- [ ] Update `render.yaml`.

  Add:

  ```yaml
  - key: SSO_PROVIDER_SECRET_STORAGE_MODE
    value: encrypted
  - key: CRON_SECRET
    sync: false
  - key: FACTORY_CAREERS_OPERATIONS_INBOX
    sync: false
  ```

- [ ] Run focused tests.

  ```bash
  npm run test:unit -- tests/unit/sso-health-alerting.test.ts tests/unit/sso-health-monitor-workflow.test.ts tests/unit/render-blueprint.test.ts tests/unit/application-email-branding.test.ts
  ```

- [ ] Commit monitoring.

  ```bash
  git add server/lib/email/templates.tsx server/utils/email.ts server/utils/env.ts render.yaml .github/workflows/sso-health-monitor.yml tests/unit/sso-health-alerting.test.ts tests/unit/sso-health-monitor-workflow.test.ts tests/unit/render-blueprint.test.ts tests/unit/application-email-branding.test.ts
  git commit --no-verify -m "feat: monitor Microsoft SSO credential health"
  ```

## Task 6: Document operations and update the changelog

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/operations/PRODUCTION-RUNBOOK.md`
- Modify: `docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md`
- Create: `docs/operations/SSO-RESILIENCE-ROLLOUT.md`
- Modify: `tests/unit/agent-guidance.test.ts`
- Modify: `tests/unit/changelog.test.ts`

- [ ] Write failing documentation contract assertions.

  Require the runbook to name both modes, compatibility-first sequencing, the minimum-safe rollback SHA field, database app-role-only rotation, live login proof, encryption-count proof, monitoring, and credential overlap/removal order. Reject examples containing `fc-sso:v1:`, connection strings, access tokens, or credential values.

- [ ] Add the operator documentation.

  `SSO-RESILIENCE-ROLLOUT.md` must have fillable metadata-only receipt fields for commit SHA, Render deploy ID, readiness timestamp, probe code, browser-login timestamp, encrypted/plaintext counts, rollback rehearsal result, Entra key IDs and expiry dates, 1Password item ID, and workflow run URL. It must explicitly forbid rollback to artifacts older than the recorded compatibility SHA.

- [ ] Add an Unreleased `Fixed` changelog entry.

  Describe rollback-safe SSO secret storage and proactive Microsoft credential monitoring in user/operator terms.

- [ ] Run documentation checks.

  ```bash
  npm run test:unit -- tests/unit/agent-guidance.test.ts tests/unit/changelog.test.ts
  npm run check:conventions
  npm run changelog:check
  ```

- [ ] Commit documentation.

  ```bash
  git add CHANGELOG.md docs/operations/PRODUCTION-RUNBOOK.md docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md docs/operations/SSO-RESILIENCE-ROLLOUT.md tests/unit/agent-guidance.test.ts tests/unit/changelog.test.ts
  git commit --no-verify -m "docs: add SSO resilience rollout runbook"
  ```

## Task 7: Run the complete pre-merge validation surface

**Files:**

- Modify as needed: only files already in this plan

- [ ] Run focused SSO and integration tests.

  ```bash
  npm run test:unit -- tests/unit/sso-provider-secrets.test.ts tests/unit/sso-readiness.test.ts tests/unit/microsoft-sso-health.test.ts tests/unit/sso-health-route.test.ts tests/unit/sso-health-alerting.test.ts tests/unit/sso-health-monitor-workflow.test.ts tests/unit/sso-credential-metadata-schema.test.ts tests/integration/sso-provider-secrets.pg.test.ts
  npm run test:e2e:sso
  ```

- [ ] Run the repository validation surface.

  ```bash
  npm run test:unit
  npm run typecheck
  npm run build
  npm run check:conventions
  npm run preflight:cli-parity
  npm audit --audit-level=high
  npm run preflight:pr
  git diff --check
  ```

- [ ] Review the entire branch diff and repository state.

  ```bash
  git status --short --branch
  git diff origin/main...HEAD --stat
  git diff origin/main...HEAD
  ```

- [ ] Commit any scoped validation fixes, rerun the affected commands, and confirm the worktree is clean.

## Task 8: Publish and merge the production release

**Files:**

- No code changes expected

- [ ] Confirm branch, remote, clean status, and current `origin/main` before push.

- [ ] Push `codex/sso-resilience` and open a draft PR with the required summary, validation, risks/skips, release notes, and OpenClaw marker.

- [ ] Register the PR with the trusted OpenClaw review-loop helper and add `review-loop:codex`.

- [ ] Wait for CI and Sparks/Kai review; address every actionable comment on the same PR and rerun affected validation.

- [ ] Mark ready only after CI, code review, build, and local/runtime verification are green.

- [ ] Merge using the repository's supported merge method, then verify `main` contains the exact reviewed commit set.

## Task 9: Phase A compatibility deployment and live proof

**Files:**

- Update receipt only: `docs/operations/SSO-RESILIENCE-ROLLOUT.md`

- [ ] Read and follow the Computer Use and deployment-specific skills before touching live UI.

- [ ] In Render, explicitly set `SSO_PROVIDER_SECRET_STORAGE_MODE=compatibility`, confirm `CRON_SECRET` and `FACTORY_CAREERS_OPERATIONS_INBOX` are configured without exposing values, and deploy the merged release.

- [ ] Verify the deployed commit SHA, `/api/readyz`, sanitized operations probe, and a real Factory-profile Safari Microsoft login to `/dashboard`.

- [ ] Run a metadata-only database query that returns counts of plaintext, encrypted, unconfigured, and invalid-marker provider rows. Confirm Factory's configured provider remains plaintext and unmarked.

- [ ] Record only non-secret receipts in the rollout document and commit them.

## Task 10: Phase A2 database credential rollback fence

**Files:**

- Update receipt only: `docs/operations/SSO-RESILIENCE-ROLLOUT.md`

- [ ] Read and follow the Supabase skill before database administration.

- [ ] Resolve the dedicated Factory Careers application role from the current `DATABASE_URL` without printing it. Prove it is not the owner/migration role.

- [ ] Rotate only that application-role password. Update Render's `DATABASE_URL` through a transcript-safe boundary and redeploy the compatibility release.

- [ ] Re-run readiness, sanitized probe, and real Safari Microsoft login proofs.

- [ ] Trigger one bounded rollback rehearsal to the known pre-compatibility Render deploy. Confirm that artifact fails database readiness and Render leaves the current healthy compatibility deployment serving traffic.

- [ ] Confirm the compatibility deploy ID and SHA are the minimum safe rollback target. Record non-secret receipts and commit them.

## Task 11: Phase B encrypted-storage activation

**Files:**

- Update receipt only: `docs/operations/SSO-RESILIENCE-ROLLOUT.md`

- [ ] Set `SSO_PROVIDER_SECRET_STORAGE_MODE=encrypted` in Render and deploy the same compatibility-capable runtime.

- [ ] Verify count-only startup logs show validation, backfill, and post-validation success with no secret values.

- [ ] Run the metadata-only storage query and confirm every configured provider secret is encrypted, no plaintext configured secrets remain, and no invalid markers exist.

- [ ] Re-run readiness, sanitized probe, and real Safari Microsoft login proofs.

- [ ] Rehearse rollback to the Phase A2 compatibility artifact and confirm it remains healthy while reading encrypted storage, then return to the current encrypted deploy.

- [ ] Record non-secret receipts and commit them.

## Task 12: Phase C Microsoft credential rotation and monitoring activation

**Files:**

- Update receipt only: `docs/operations/SSO-RESILIENCE-ROLLOUT.md`

- [ ] Read and follow the FactoryHQ Microsoft 365 admin and 1Password skills before account changes.

- [ ] Through Ada's scoped admin lane, create exactly one overlapping password credential on the existing Factory Careers Entra app.

- [ ] Persist its concealed value to 1Password through a transcript-safe writer. Independently read the concealed value and prove it with a Microsoft client-credential exchange before changing production. If this fails, remove the unused new Entra credential and stop.

- [ ] Update the Factory Careers provider through the supported secure boundary, preserving every non-secret OIDC field. Upsert the new key ID, activation, and expiration metadata; never store or display the value outside the provider secret and 1Password.

- [ ] Verify metadata readback, sanitized probe, readiness, and a real Safari Microsoft login to `/dashboard`.

- [ ] Remove the predecessor Entra credential only after all replacement proofs pass. Read back Entra keys and 1Password metadata.

- [ ] Add `FACTORY_CAREERS_PRODUCTION_URL` and `FACTORY_CAREERS_CRON_SECRET` as GitHub Actions secrets without printing values. Manually run the SSO monitor workflow and confirm a healthy result with no incident issue.

- [ ] Confirm the recurring workflow is enabled and the app metadata contains the new expiration date and last-success timestamp.

- [ ] Record the final non-secret receipts, commit and push the receipt update, and verify repository, Entra, 1Password, Render, database metadata, monitor, and real-login state one final time.

## Final Self-Review

- [ ] Every goal and completion criterion in `docs/superpowers/specs/2026-08-10-sso-resilience-design.md` maps to a task above.
- [ ] No task contains placeholder code, an unresolved design choice, or a secret-bearing command.
- [ ] All public and internal types use the same stable health-code vocabulary.
- [ ] Compatibility and encrypted modes are both tested at adapter, startup, PostgreSQL, and production levels.
- [ ] Production mutations preserve the previous safe state until the next state has independent readback proof.
