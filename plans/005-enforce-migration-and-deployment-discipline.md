# 005 — Enforce Migration and Deployment Discipline

Status: DONE

## Outcome

Every schema change must append one forward migration and journal entry.
Applied SQL and journal history are immutable. Pull requests rehearse a clean
base install followed by the branch upgrade on PostgreSQL. Main-branch deploys
are gated to the exact commit by migrations, PostgreSQL integration, unit,
lint, typecheck, production environment validation, and build.

## Implementation

- `scripts/check-migration-discipline.mjs` rejects edits, deletion, reordering,
  missing SQL, missing journal entries, and schema changes without migration.
- `scripts/rehearse-migration-upgrade.ts` applies base and branch migrations to
  a temporary database and validates the ledger, model, and application role.
- PR and production gate workflows run the rehearsal with PostgreSQL 16.
- `render.yaml` declares the audited Starter service and deploy-after-checks.
- Repairs always append a forward migration. No bypass label exists.

## Proof

Mutation tests cover edited/deleted SQL, journal rewrites, missing migrations,
clean installs, and upgrades. The real rehearsal also runs locally on
PostgreSQL 17.
