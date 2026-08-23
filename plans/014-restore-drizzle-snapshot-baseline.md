# Plan 014: Restore a current Drizzle snapshot baseline

> **Executor instructions**: This migration-metadata repair is high risk. Work
> only from a fresh `codex/drizzle-snapshot-baseline` branch based on
> `origin/main`. Run each gate in order. Stop immediately on any STOP condition;
> never hand-edit snapshot identifiers or rewrite applied migration history.
> Update the plan index after completion unless the reviewer owns it.
>
> **Drift check (run first)**:
> `git diff --stat 88f7c18..HEAD -- drizzle.config.ts server/database/migrations server/database/schema scripts/check-migration-discipline.mjs scripts/rehearse-migration-upgrade.ts tests/unit/migration-discipline.test.ts package.json`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `88f7c18`, 2026-08-23

## Why this matters

The migration journal reaches `0065`, but the newest Drizzle snapshot is
`0034_snapshot.json`. The discipline checker validates append-only SQL and
journal tags without requiring a current snapshot. A future schema generation
can therefore compare against stale metadata and propose DDL that production
already applied.

The repair must establish a tool-generated current baseline without modifying
any applied SQL or existing journal entry.

## Current state

- `server/database/migrations/meta/_journal.json` ends at migration `0065`.
- `server/database/migrations/meta/0034_snapshot.json` is the newest snapshot;
  snapshots `0035` through `0065` do not exist.
- `package.json` defines `db:generate` as `drizzle-kit generate`.
- Installed Drizzle Kit supports `generate --custom`, documented by its local
  help as preparing an empty custom migration.
- `scripts/check-migration-discipline.mjs:57-98` checks new SQL files and journal
  entries but never checks snapshot presence.
- `tests/unit/migration-discipline.test.ts:49-66` considers appended SQL and a
  journal entry valid without any snapshot.
- Existing migration SQL and journal history are immutable repo policy.

## Required repair shape

Use Drizzle Kit itself to append one no-op custom migration named
`current_schema_snapshot`. It must create the next journal entry and a snapshot
representing the current schema. The generated SQL must contain no executable
DDL. Do not synthesize missing historical snapshots and do not edit identifiers
or `prevId` values manually.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Tool version | `npx drizzle-kit --version` | version matching the lockfile |
| Custom baseline | `npm run db:generate -- --custom --name current_schema_snapshot` | one next-numbered SQL file, journal append, and snapshot |
| Discipline | `npm run check:migration-discipline` | exit 0 |
| Upgrade rehearsal | `npm run test:integration:migrations` | exit 0 against isolated PostgreSQL |
| No-diff probe | `npm run db:generate -- --name unchanged_schema_probe` | reports no schema changes and creates no migration |
| Focused tests | `npm run test:unit -- tests/unit/migration-discipline.test.ts tests/unit/migration-locking.test.ts` | all pass |
| Full preflight | `npm run preflight:pr` | exit 0 |

The integration commands require the repo's documented isolated PostgreSQL
environment. Never point them at production or a shared development database.

## Scope

**In scope**:

- one tool-generated next-numbered custom migration SQL file
- its tool-generated `server/database/migrations/meta/*_snapshot.json`
- appended `_journal.json` entry produced by the tool
- `scripts/check-migration-discipline.mjs`
- `tests/unit/migration-discipline.test.ts`
- migration-operation docs only if the validated command changes
- `CHANGELOG.md` only if operators must apply the no-op migration

**Out of scope**:

- Editing migrations `0000` through `0065`.
- Creating hand-authored snapshots for missing historical numbers.
- Changing application schema or runtime behavior.
- Running `drizzle-kit push`.
- Running any migration command against production.

## Git workflow

- Branch: `codex/drizzle-snapshot-baseline`
- Commit: `fix: restore Drizzle migration snapshot baseline`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Prove the stale-baseline behavior in a disposable worktree

Before touching the branch, run ordinary `db:generate` in a disposable worktree
based on `88f7c18` and capture only filenames and a DDL summary. Delete the
disposable output after inspection. Do not copy generated duplicate DDL into the
implementation branch.

**Verify**: the probe confirms Drizzle is comparing against stale metadata. If
it instead reports no changes, stop: the finding's assumed failure mode is
false and the plan needs revision.

### Step 2: Generate a tool-owned current snapshot

Run the custom-baseline command once on the implementation branch. Confirm:

- exactly one next-numbered SQL file was added;
- exactly one snapshot was added;
- the journal only appended one entry;
- existing journal entries and migrations are byte-for-byte unchanged;
- the SQL file has no executable DDL.

**Verify**: `git diff -- server/database/migrations` shows only those generated
additions and the journal append. If the tool creates executable DDL, omits a
snapshot, or rewrites history, stop and discard only the uncommitted generated
files through a recoverable, reviewed operation.

### Step 3: Enforce a current snapshot for future migrations

Extend `check-migration-discipline.mjs` so every newly appended migration after
the baseline has a matching snapshot and the newest journal entry has a
matching newest snapshot. Preserve the one-time historical gap before the
baseline. Make the baseline tag explicit in the checker so the exception cannot
silently move forward.

Update fixture tests to cover: valid SQL+journal+snapshot, missing snapshot,
snapshot without journal entry, rewritten snapshot history, and preserved
pre-baseline gaps.

**Verify**: focused migration-discipline tests pass and intentional missing-
snapshot fixtures fail with actionable messages.

### Step 4: Prove generation and upgrade are clean

Run the no-diff probe after the baseline. It must report no changes and create
no files. Run the base-to-branch migration rehearsal against isolated
PostgreSQL, then the full PR preflight.

**Verify**: discipline, no-diff probe, migration rehearsal, and preflight all
exit 0. `git status --short` contains no probe artifact.

## Test plan

- Unit fixtures enforce snapshot alignment after the named baseline.
- A disposable ordinary-generate probe demonstrates the prior drift.
- A second generate after repair produces no migration.
- Base-to-branch PostgreSQL migration rehearsal succeeds.
- Existing applied SQL and journal entries remain byte-identical.

## Done criteria

- [ ] A tool-generated current snapshot exists at the journal tip.
- [ ] The accompanying custom migration contains no executable DDL.
- [ ] No historical SQL, snapshot, or journal entry was rewritten.
- [ ] Future appended migrations require corresponding snapshots.
- [ ] A second generation produces no changes or files.
- [ ] Migration rehearsal and full PR preflight pass.
- [ ] `git diff --check` exits 0 and only in-scope files changed.

## STOP conditions

- Ordinary generation already reports no schema changes at `88f7c18`.
- `--custom` does not create a current snapshot with the installed Drizzle Kit.
- The tool generates executable DDL for the baseline.
- Repair appears to require editing an applied migration or existing journal entry.
- Migration rehearsal targets anything except a disposable isolated database.

## Maintenance notes

Review the generated snapshot as a tool artifact, not hand-authored JSON. Future
schema PRs must include SQL, journal, and snapshot together. Keep the named
historical exception fixed at this baseline; never advance it to make CI green.
