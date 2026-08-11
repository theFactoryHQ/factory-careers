# Factory Careers SSO Resilience Rollout

Use this ledger for the staged Factory production rollout. Record only the
non-secret values named below. Never paste a credential value, database URL,
token, stored provider configuration, secret-derived identifier, or raw OAuth
response into this file, a terminal transcript, a pull request, or an issue.

## Rollout authority

- Production provider: `thefactoryhq-sso`
- Storage sequence: `compatibility` then database fence then `encrypted`
- Microsoft rotation sequence: create replacement, persist and independently
  verify it, update the application, prove login, then remove the predecessor
- Probe schedule after activation: every 15 minutes
- Rollback rule: never select an artifact older than the recorded minimum safe
  rollback commit and deploy ID

## Receipt ledger

| Receipt | Value |
| --- | --- |
| Reviewed pull request URL |  |
| Merged commit SHA |  |
| Compatibility commit SHA |  |
| Minimum safe rollback commit SHA |  |
| Compatibility Render deploy ID |  |
| Minimum safe rollback Render deploy ID |  |
| Encrypted-mode Render deploy ID |  |
| Final Render deploy ID |  |
| Readiness timestamp |  |
| Probe code |  |
| Browser login timestamp |  |
| Plaintext provider count after Phase A |  |
| Encrypted provider count after Phase B |  |
| Invalid-marker provider count |  |
| Rollback rehearsal result |  |
| Database application role name |  |
| Database application-role rotation timestamp |  |
| Entra predecessor key ID |  |
| Entra predecessor expiry |  |
| Entra replacement key ID |  |
| Entra replacement activation |  |
| Entra replacement expiry |  |
| 1Password item ID |  |
| GitHub monitor enabled timestamp |  |
| Workflow run URL |  |
| Final readback timestamp |  |

## Phase A: compatibility release

1. Set `SSO_PROVIDER_SECRET_STORAGE_MODE=compatibility` on the current Render
   service before its deployment can start.
2. Confirm `CRON_SECRET`, `FACTORY_CAREERS_OPERATIONS_INBOX`, and
   `FACTORY_CAREERS_SSO_PROVIDER_ID` are present through value-hidden UI.
3. Deploy the reviewed commit and verify its exact SHA and Render deploy ID.
4. Require `/api/readyz` to return its normal healthy response.
5. Call the authenticated SSO health route and record only its stable probe code
   and checked timestamp.
6. Complete a real Microsoft sign-in in the Safari Factory profile and reach
   `/dashboard`.
7. Run the metadata-only storage-count query from the production runbook. The
   configured Factory provider must remain plaintext and unmarked in this phase.
8. Record the compatibility SHA and deploy ID as provisional rollback targets.

## Phase A2: fence historical artifacts

1. Resolve the dedicated Factory Careers database application role and prove it
   is not the database owner or migration role.
2. Rotate only that application role's password through the managed database
   administration surface.
3. Update Render's hidden `DATABASE_URL` value and redeploy the same
   compatibility-capable commit.
4. Repeat readiness, stable probe, and real Microsoft sign-in checks.
5. Start one bounded rollback rehearsal to a pre-compatibility Render artifact.
   The old artifact must fail database readiness, and Render must leave the
   current compatibility deployment serving traffic.
6. Record the current commit and deploy as the minimum safe rollback target.
   Rollback to any earlier artifact is forbidden.

## Phase B: encrypted storage

1. Set `SSO_PROVIDER_SECRET_STORAGE_MODE=encrypted` and deploy the same
   compatibility-capable runtime.
2. Confirm count-only startup events show initial validation, backfill, and
   post-validation completion.
3. Run the metadata-only count query. Every configured client secret must be in
   encrypted storage, with zero plaintext records and zero invalid markers.
4. Repeat readiness, stable probe, and real Microsoft sign-in checks.
5. Rehearse rollback to the Phase A2 artifact. It must remain healthy because it
   understands both storage formats. Return to the encrypted deployment.

## Phase C: Microsoft credential rotation

1. Through the scoped FactoryHQ Microsoft admin lane, create exactly one
   replacement password credential while preserving the predecessor.
2. Persist the concealed replacement in the canonical 1Password item through a
   transcript-safe path.
3. Independently read the concealed value and validate it with a Microsoft
   client-credential exchange before changing Factory Careers. If persistence
   or verification fails, remove the unused replacement and stop.
4. Update only the provider's credential value through a supported secure
   boundary, preserving every non-secret OIDC field.
5. Upsert the replacement key ID, activation time, and expiry time in
   `sso_provider_credential_metadata`.
6. Verify metadata readback, the stable probe, readiness, and a real Microsoft
   sign-in to `/dashboard`.
7. Remove the predecessor only after every replacement proof passes.
8. Read back the remaining Entra key metadata and the 1Password item metadata.

## Monitoring activation and final readback

1. Store `FACTORY_CAREERS_PRODUCTION_URL` and
   `FACTORY_CAREERS_CRON_SECRET` as GitHub Actions secrets without displaying
   either value.
2. Manually run `Factory Careers SSO Health Monitor` and require a healthy
   result with no open SSO incident issue.
3. Confirm the scheduled workflow is enabled and runs every 15 minutes.
4. Confirm application metadata has the replacement expiry and a recent
   successful probe timestamp.
5. Perform final non-secret readbacks from Entra, 1Password metadata, Render,
   database metadata, GitHub Actions, repository state, and a real browser login.

## Metadata-only storage count

This query classifies records without returning a credential value or stored
configuration:

```sql
SELECT
  count(*) FILTER (
    WHERE oidc_config::jsonb ? 'clientSecret'
      AND NOT (oidc_config::jsonb ? '_factoryCareersClientSecretEncryption')
  ) AS plaintext_provider_count,
  count(*) FILTER (
    WHERE oidc_config::jsonb ? 'clientSecret'
      AND oidc_config::jsonb ->> '_factoryCareersClientSecretEncryption' = 'v1'
  ) AS encrypted_provider_count,
  count(*) FILTER (
    WHERE oidc_config::jsonb ? '_factoryCareersClientSecretEncryption'
      AND oidc_config::jsonb ->> '_factoryCareersClientSecretEncryption' <> 'v1'
  ) AS invalid_marker_count,
  count(*) FILTER (
    WHERE NOT (oidc_config::jsonb ? 'clientSecret')
  ) AS public_client_count
FROM sso_provider
WHERE oidc_config IS NOT NULL;
```
