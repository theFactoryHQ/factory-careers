# 006 — Fail Closed on Dependency Readiness

Status: DONE

## Outcome

Production cannot become ready when migrations, the ordinary application
database role, storage, or SSO are unusable. `/api/readyz` returns only
`{ "ok": true }` or a sanitized 503.

## Implementation

- Startup verifies the migration ledger and modeled schema.
- The application role must be non-superuser, non-DDL, and hold required table
  and sequence privileges.
- Storage performs a timed random write, head, and delete canary.
- Production rejects storage and migration skip settings.
- Migration and storage startup failures emit sanitized critical alerts.
- Render readiness keeps the prior healthy deployment serving on failure.

## Proof

Unit and PostgreSQL integration tests cover permissions, writes, heads,
deletes, timeouts, sanitization, and fail-closed startup behavior.
