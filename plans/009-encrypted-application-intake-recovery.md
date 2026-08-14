# 009 — Encrypted Replayable Application Intake Recovery

Status: DONE

## Outcome

Validated intake is durably encrypted before the first database read. An
unexpected downstream failure returns HTTP 202 with a receipt; the candidate
does not need to resubmit. Owners can inspect metadata, replay, and purge
without exposing decrypted applicant data.

## Implementation

- AES-256-GCM uses a fresh 96-bit IV, authenticated receipt/key context, and a
  JSON keyring with an explicit active key ID.
- Random date-partitioned S3 keys contain no name, email, filename, response,
  job slug, or other applicant identifier.
- Successful and expected-invalid requests delete the buffer. Unexpected
  failures retain it for seven days. Buffer failure returns sanitized 503.
- Each relational application records its random recovery receipt ID. Replay
  accepts a completed receipt, removes a partial receipt-bound application and
  artifacts before retrying, and rejects unrelated duplicates.
- Owner-only CLI commands provide metadata list/status, confirmed replay, and
  confirmed expiry purge. A cron-authenticated daily purge enforces retention.
- Replay and purge write metadata-only audit events.

## Proof

Tests cover encryption, plaintext absence, tampering, wrong and retired keys,
rotation, expiry, 202 behavior, UI copy, owner authorization, CLI confirmation,
partial cleanup, completed detection, idempotency, and metadata-only output.

## Production Rollout

1. Deploy with recovery disabled.
2. Store the keyring and deployment credentials in Factory 1Password and
   Render without printing them.
3. Enable recovery and deploy the exact gated commit.
4. Force a canary-only downstream failure and prove receipt, replay, cleanup,
   audit, notification suppression, and zero residue.

Stop if the live blueprint differs, a secret is absent, cleanup leaves residue,
or any test, log, issue, or command exposes applicant information.
