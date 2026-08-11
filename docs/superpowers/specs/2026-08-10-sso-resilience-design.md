# Factory Careers SSO Resilience Design

## Status

Approved for implementation by Doug Ebanks on 2026-08-10.

## Problem

Factory Careers production ran a pre-encryption build while the shared
`sso_provider` record had already been migrated to encrypted `fc-sso:v1`
storage. The old runtime submitted ciphertext to Microsoft as the OAuth client
secret, and Microsoft rejected the token exchange with `invalid_client`.

The existing implementation combines two changes in one startup path:

1. a database adapter that can decrypt SSO provider secrets; and
2. an automatic backfill that rewrites plaintext records as ciphertext.

That combination is not safe during a mixed-version or rollback window. A new
instance can rewrite the shared record while an old instance is still serving
traffic. A failed new deploy or later rollback can then leave the old runtime
connected to data it cannot interpret.

The immediate incident repair restored the provider record to plaintext for
the currently deployed old runtime. This design replaces that temporary
compatibility state with a staged, monitored, rollback-fenced rollout.

## Goals

- Prevent mixed-version deploys from making Microsoft login unavailable.
- Make encrypted SSO storage a separate, explicitly activated rollout phase.
- Detect undecryptable, invalid, or expiring Microsoft credentials before a
  staff member discovers the failure.
- Preserve zero-downtime deployment and a known-safe rollback target.
- Keep every credential, token, ciphertext, and raw provider error out of logs,
  HTTP responses, CI output, and audit artifacts.
- Complete the production rollout with a real Microsoft sign-in and dashboard
  proof after every consequential phase.

## Non-goals

- Supporting arbitrary historical Factory Careers builds indefinitely.
- Exposing provider-health details through a public endpoint.
- Creating or rotating Microsoft credentials from ordinary application code.
- Replacing Better Auth or the existing organization SSO model.

## Considered Approaches

### 1. Immediate deployment of the current encrypted-storage build

This is the fastest code path but repeats the original hazard: startup can
backfill shared data while the old production instance is still active. If the
new instance fails or an operator rolls back, the old build cannot read the
rewritten record. Rejected.

### 2. Keep SSO secrets plaintext and add monitoring

This avoids the storage-version incompatibility but abandons the existing
at-rest protection. It also detects credential expiry without addressing the
deployment architecture. Rejected as the permanent state.

### 3. Staged compatibility release, credential-fenced rollback, then encryption

The first release understands both storage formats but does not encrypt shared
records. After it is live and verified, the database app-role credential is
rotated so older Render artifacts retain an invalid connection string and fail
readiness rather than taking traffic. Encryption is activated only after that
fence exists. Recommended and approved.

## Architecture

### Storage modes

Add `SSO_PROVIDER_SECRET_STORAGE_MODE` with two explicit values:

- `compatibility`: read plaintext or `fc-sso:v1` ciphertext; write plaintext;
  remove the Factory encryption marker on writes; never run the backfill.
- `encrypted`: read plaintext or ciphertext; write ciphertext; run the existing
  advisory-lock-protected backfill.

Non-production and self-hosted development default to `encrypted` so existing
secure installations do not silently regress. Production must set the mode
explicitly: Factory starts with `compatibility` and may select `encrypted` only
after the rollback fence is verified. An unset or blank production value fails
environment validation before a backfill can begin.

The adapter must use the same parser, marker validation, key derivation, and
generic error type in both modes. No call site outside the adapter receives a
stored ciphertext value.

### Read-only validation before mutation

Extract a read-only validation function that scans SSO provider records under a
bounded query and verifies:

- JSON shape and marker consistency;
- supported storage version;
- successful decryption for ciphertext records; and
- non-empty plaintext for configured client secrets.

Startup runs this validation before any backfill. In `compatibility` mode,
startup stops after validation. In `encrypted` mode, validation is followed by
the existing locked backfill and a second validation pass.

A malformed or undecryptable record fails startup closed with a sanitized error
and no database mutation.

### Readiness state

The migration/startup plugin records an in-process SSO storage readiness state
only after validation completes. `/api/readyz` requires both the existing
database readiness proof and this SSO state. The response remains `{ "ok":
true }`; failures return a generic 503 without provider identifiers or storage
details.

Readiness does not call Microsoft on every load-balancer request. External
credential validity is handled by the operational probe described below.

### Operational Microsoft probe

Add a server utility and authenticated operations route that perform a
Microsoft client-credential token exchange using the same provider secret the
SSO callback would use. The route:

- requires the existing `CRON_SECRET` authentication pattern;
- targets an explicitly configured Factory SSO provider;
- uses the provider's configured issuer/tenant and client ID;
- returns only a coarse status code and timestamp;
- never returns an access token, secret, ciphertext, fingerprint, raw Microsoft
  response, tenant ID, client ID, or provider ID; and
- maps `invalid_client` to a stable internal result code without logging the raw
  error description.

The probe result is cached briefly in-process to prevent accidental request
amplification. A scheduled GitHub workflow calls the route every fifteen
minutes. Two consecutive transient failures create or update one GitHub incident
issue. `invalid_client`, missing metadata, or an expiry threshold breach alert
immediately. Production also sends the configured operational email through the
existing transactional email boundary when the state changes from healthy to
unhealthy; repeat alerts are rate-limited.

### Credential metadata and expiry

Store non-secret credential metadata separately from Better Auth's OIDC JSON:

- provider record ID;
- Microsoft password credential key ID;
- activation timestamp;
- expiration timestamp; and
- last successful probe timestamp.

The metadata table contains no credential value, token, ciphertext, or
fingerprint. It is organization-scoped and updated during the controlled
rotation workflow. Alerts fire at 30, 14, and 7 days before expiration and
immediately after expiration.

### Rollback fence

The production sequence creates a real fence against pre-compatibility Render
artifacts:

1. Deploy the compatibility release with the current database app-role
   credential.
2. Verify readiness, Microsoft token exchange, and real browser sign-in.
3. Rotate the dedicated production database app-role password.
4. Update only the current Render service environment and deploy the same
   compatibility-capable code again.
5. Verify that the new deployment is healthy.
6. Rehearse rollback to one pre-compatibility artifact. Its captured old
   `DATABASE_URL` must fail `/api/readyz`, and Render must keep the current
   deployment serving traffic.

Render rollbacks reuse the target deploy's captured environment variables and
health-check configuration. Rotating the database credential therefore makes
the unsafe artifact unable to connect to the database or pass readiness. No
user traffic should move to it.

The compatibility release becomes the minimum safe rollback target. The
production runbook and release checklist record its commit SHA and explicitly
forbid rollback to an earlier artifact.

## Production Rollout

### Phase A: Compatibility

1. Implement and verify the two storage modes, validation, readiness, probe,
   monitoring, and documentation.
2. Set Factory production to `SSO_PROVIDER_SECRET_STORAGE_MODE=compatibility`.
3. Deploy the compatibility release with CI checks required.
4. Confirm `/api/readyz`, the sanitized Microsoft probe, and a real Microsoft
   sign-in to `/dashboard`.
5. Confirm the production provider record remains plaintext and unmarked using
   a metadata-only query.

### Phase A2: Fence historical artifacts

1. Rotate only the Supabase/PostgreSQL application-role credential; do not
   rotate the owner/migration credential.
2. Update the current Render service's `DATABASE_URL` without printing it.
3. Redeploy the compatibility release and repeat readiness and login proofs.
4. Trigger one bounded rollback rehearsal to the prior unsafe artifact and
   confirm it fails readiness while the current deployment remains live.
5. Roll forward to the verified compatibility release if Render creates a
   failed rollback deployment record.

### Phase B: Encrypted storage

1. Set `SSO_PROVIDER_SECRET_STORAGE_MODE=encrypted`.
2. Deploy the same compatibility-capable runtime.
3. Confirm the startup log reports one successful, count-only backfill result.
4. Verify metadata-only counts show every configured secret encrypted.
5. Repeat the Microsoft probe and real browser login.
6. Confirm rollback to the Phase A2 artifact remains healthy because it can
   read both formats.

### Phase C: Microsoft credential rotation

The currently active credential expires on 2026-08-19 and must be replaced
before the rollout is considered complete.

1. Ada creates exactly one overlapping Microsoft password credential through
   the scoped FactoryHQ admin lane.
2. Persist the concealed value to the canonical 1Password item and verify the
   stored value through a transcript-safe token exchange before touching
   production.
3. Update the Factory Careers provider through a supported secure application
   or database boundary, preserving all non-secret OIDC fields.
4. Read back non-secret metadata, run the Microsoft probe, and complete a real
   browser login.
5. Only after those proofs, remove the predecessor Microsoft credential.
6. Read back Entra, 1Password metadata, application metadata, and live login
   state. No secret value is emitted at any step.

If the concealed value cannot be persisted and independently verified, abort
the rotation and remove the unused new Microsoft credential. Production stays
on the verified predecessor.

## Error Handling

- Unsupported storage modes fail environment validation at startup.
- Unknown marker versions, malformed JSON, empty secrets, or decryption errors
  fail closed with `SsoProviderSecretError` and a generic production message.
- Validation completes before backfill so a failed validation cannot partially
  migrate data.
- Backfill remains idempotent, advisory-lock protected, bounded, and compare-
  and-swap guarded.
- Microsoft probe failures are normalized to stable internal codes. Raw
  responses and OAuth descriptions are discarded.
- Monitoring alerts are state-transition-based and rate-limited.
- Rotation preserves the predecessor until the replacement passes every proof.

## Testing

Implementation follows red-green TDD.

### Unit tests

- compatibility mode reads plaintext and ciphertext;
- compatibility mode writes plaintext and removes the marker;
- encrypted mode reads both formats and writes ciphertext;
- startup validation rejects malformed, unsupported, and undecryptable records;
- validation runs before any backfill mutation;
- readiness stays 503 until SSO validation succeeds;
- probe results contain no sensitive fields or raw provider errors;
- expiry thresholds and alert deduplication behave deterministically; and
- environment validation accepts only the two documented modes.

### PostgreSQL integration tests

- simulate an old plaintext reader alongside compatibility mode;
- prove compatibility writes remain readable by the old reader;
- activate encrypted mode and prove the compatibility reader still works;
- prove compare-and-swap and advisory locking under concurrent startup;
- prove failed validation leaves every row unchanged; and
- prove credential metadata is organization scoped and contains no secret
  material.

### Browser and operations tests

- mock OIDC registration, sign-in, callback, and auto-provisioning remain green;
- operations probe rejects missing or invalid authorization;
- sanitized failure and success responses are covered;
- Render blueprint, production environment contract, changelog, and runbook
  convention checks pass; and
- the production rollout records real readiness, token-exchange, browser login,
  encryption-count, and rollback-rehearsal evidence.

## Validation Surface

Before merge and deployment:

```bash
npm run test:unit
npm run typecheck
npm run build
npm run check:conventions
npm run preflight:cli-parity
npm audit --audit-level=high
git diff --check
```

Run focused PostgreSQL integration and SSO Playwright tests in addition to the
repository-wide checks. Run `npm run preflight:pr` before pushing the production
branch.

## Documentation and Changelog

- Add an Unreleased **Fixed** entry describing rollback-safe SSO secret storage
  and proactive credential monitoring.
- Update the production runbook with storage modes, the minimum safe rollback
  SHA, database credential fencing, rollback rehearsal, Microsoft rotation, and
  incident response.
- Keep all examples metadata-only. Documentation must never show a credential,
  token, ciphertext, fingerprint, connection string, or raw OAuth response.

## Completion Criteria

The work is complete only when:

- the compatibility and encrypted-mode test matrix passes;
- the production database is encrypted under a runtime that can read both
  formats;
- unsafe historical Render artifacts are fenced by the rotated database
  credential;
- a bounded rollback rehearsal proves the current deployment stays live;
- the Microsoft credential is rotated and its expiry metadata is monitored;
- the recurring probe and alert path are live;
- a real Microsoft sign-in reaches the Factory Careers dashboard after the
  final deployment; and
- Entra, 1Password metadata, Render, database metadata, and repository state
  each have a non-secret readback receipt.
