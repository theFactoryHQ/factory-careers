# Factory Careers Microsoft credential rotation

The sign-in and interview calendar use separate credentials on the Factory Careers Integration Entra application. The rotation workflow evaluates both every day. The five-day gap before the first expiry warning gives the runner time to resolve a transient failure. It starts rotation at 35 days before expiry, requests a 90-day replacement, and keeps the previous key for seven days after production verification.

## Set up the runner

1. Create the `careers-microsoft-rotation` GitHub environment. Allow deployments from `main` only. Keep `CAREERS_MICROSOFT_ROTATION_ENABLED` unset while commissioning.
2. Create a dedicated single-tenant Entra workload identity. Configure GitHub's OIDC issuer, audience `api://AzureADTokenExchange`, and subject `repo:theFactoryHQ/factory-careers:environment:careers-microsoft-rotation`.
3. Grant the workload identity Microsoft Graph `Application.ReadWrite.OwnedBy` and ownership of the Factory Careers Integration app registration. Verify it owns only that app. Keep separate tenant admin and calendar application identities for their existing functions.
4. Create a Factory 1Password vault for the two Careers credentials. Scope a service account to read and write that vault. Store its token as the GitHub environment secret `CAREERS_ROTATION_OP_TOKEN`.
5. Configure a Render API key for the Factory Careers service. It needs service and environment reads, individual environment variable writes, and deploy operations. Store it as the environment secret `CAREERS_ROTATION_RENDER_API_KEY`.
6. Set the environment variables listed in the workflow. Use the Entra application object ID as well as the application client ID. Set the Factory tenant, existing production service, and exact 1Password vault and item IDs.
7. Seed both API Credential items from the verified production values. Use the existing metadata from Entra for each key. Keep `credential`, `staged credential`, and `previous credential` concealed. Leave the last two empty initially. The text field `rotation state` starts with the following structure.

```json
{
  "service": "sso",
  "appId": "<application client ID>",
  "current": {
    "keyId": "<active Entra key ID>",
    "activatedAt": "<Entra start timestamp>",
    "expiresAt": "<Entra expiration timestamp>"
  },
  "pending": null,
  "previous": null
}
```

Use `calendar` for the calendar item. Include the existing `secret key ID` text field and the built-in `valid from` and `expires` date fields. Keep one item as the authoritative copy for each active credential.

Set Render's `MICROSOFT_CALENDAR_CREDENTIAL_EXPIRES_AT` to the verified expiry in UTC while deploying the monitor. Set `FACTORY_CAREERS_MICROSOFT_ALERT_EMAIL` to the designated incident recipient. The monitor uses the operations inbox when that override is empty. Deploy and verify the monitor before running the rotation workflow. The database URL must connect through a dedicated session because the runner holds a PostgreSQL advisory lock across the rotation.

## Verify before enabling

Run **Factory Careers Microsoft Credential Rotation** on `main` with **Apply** off. Verify both checks can read their live configuration and exchange the current credentials. Verify the calendar credential can open the interview mailbox.

Set the repository variable `CAREERS_MICROSOFT_ROTATION_ENABLED=true` after the dry run passes. Verify the first scheduled check succeeds. The credentials become due 35 days before expiry.

Supervise the first due rotation. Verify a fresh Microsoft browser sign-in and create and cancel a synthetic interview with Outlook sync. Confirm the replacement key IDs and dates in 1Password and Entra. Confirm the production health checks pass.

Check the Entra and 1Password metadata again after the seven-day retirement window.

## Recover an interrupted rotation

The 1Password item records issuance intent before Microsoft creates the key. If the item contains intent without a pending key ID, use the recorded timestamp and credential name to identify the exact Entra result. Where the value was lost, verify production still uses the previous credential before removing the unused key and clearing intent.

If a pending key and concealed value are present, use the same workflow to resume. The workflow reuses that key and checks the live target. Keep the previous key until both custody and runtime verification pass. Keep the pending key if a deployment or production check is inconclusive.

During overlap, the authoritative item preserves the prior concealed value and its Entra metadata. Disable the schedule before a manual rollback. Restore the prior credential and expiry to production and verify the live check. Reconcile the corresponding 1Password state before enabling the schedule again.

## Incident notices

The monitor checks sign-in credentials and Outlook mailbox access every 15 minutes. It opens one issue and sends one operations email for each outage, expiry warning, configuration warning, or unavailable monitor. Transient failures require a second sample. A successful probe can close an outage while the expiry warning stays open. Recovery closes the issue without a comment.

The issue records email acceptance. The monitor retries delivery with the same email idempotency key for up to 23 hours. An unconfirmed send beyond that window requires operator reconciliation with the email provider before retrying. Review the issue history when diagnosing an interrupted notification.
