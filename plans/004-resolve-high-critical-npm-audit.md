# Plan 004: Resolve high and critical npm audit advisories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 277bca7..HEAD -- package.json package-lock.json docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md .github/workflows/pr-validation.yml`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `277bca7`, 2026-06-15

## Why this matters

The production approval checklist requires `npm audit --audit-level=high` to
return zero high or critical vulnerabilities. At commit `277bca7`, that command
fails with high-severity `esbuild` advisories and a critical `shell-quote`
advisory. The PR workflow records audit output but treats it as advisory-only,
so this can quietly drift until launch approval.

This plan fixes the dependency graph deliberately. Do not run
`npm audit fix --force`; the current audit output proposes a breaking
`drizzle-kit@0.19.1` path, which is older than the app's current
`drizzle-kit@0.31.x` tooling.

## Current state

Relevant files:

- `package.json` - dependency versions and npm overrides.
- `package-lock.json` - locked transitive dependency graph.
- `.github/workflows/pr-validation.yml` - CI audit step is advisory-only.
- `docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md` - production approval
  requires a clean high-severity audit.

Current package scripts and overrides:

```json
// package.json:28
"test": "vitest run",
"test:unit": "vitest run",
"check:conventions": "bash scripts/check-conventions.sh",
"preflight:pr": "node scripts/run-pr-validation-preflight.mjs",
"preflight:cli-parity": "node scripts/run-pr-validation-preflight.mjs --step cli-parity",
"typecheck": "nuxi typecheck",

// package.json:119
"overrides": {
  ...
  "esbuild": "0.28.0",
  ...
}
```

Current locked vulnerable packages:

```text
package-lock.json:9823  node_modules/esbuild version 0.28.0
package-lock.json:17352 node_modules/shell-quote version 1.8.3
```

Current transitive paths from the lockfile:

```text
shell-quote
  required by node_modules/launch-editor@2.13.2 range ^1.8.3

esbuild
  required by node_modules/@esbuild-kit/core-utils@3.3.2 range ~0.18.20
  required by node_modules/@intlify/bundle-utils@11.1.2 range ^0.25.4
  required by node_modules/drizzle-kit@0.31.10 range ^0.25.4
  required by node_modules/nitropack@2.13.4 range ^0.28.0
  required by node_modules/tsx@4.22.4 range ~0.28.0
  required by node_modules/vite@7.3.3 range ^0.27.0

@esbuild-kit/core-utils
  required by node_modules/@esbuild-kit/esm-loader@2.6.5 range ^3.3.2

@esbuild-kit/esm-loader
  required by node_modules/drizzle-kit@0.31.10 range ^2.5.5
```

Current audit output at plan time:

```text
npm audit --audit-level=high
esbuild 0.17.0 - 0.28.0
Severity: high
fix available via `npm audit fix --force`
Will install drizzle-kit@0.19.1, which is a breaking change

shell-quote 1.1.0 - 1.8.3
Severity: critical
fix available via `npm audit fix`

19 vulnerabilities (18 high, 1 critical)
```

Production approval requires a clean audit:

```md
<!-- docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md:25 -->
| `npm audit --audit-level=high` | 0 high/critical vulnerabilities |  |
```

CI currently captures audit output but does not fail the job:

```yaml
# .github/workflows/pr-validation.yml:77
- name: Audit dependencies (high severity+)
  id: audit
  shell: bash
  run: |
    set -euo pipefail
    npm audit --audit-level=high 2>&1 | tee audit-output.txt || true
    # Advisory-only: does not fail the job on high-severity transitive issues.
```

Advisory references:

- `shell-quote`: https://github.com/ljharb/shell-quote/security/advisories/GHSA-w7jw-789q-3m8p
- `esbuild`: https://github.com/advisories/GHSA-gv7w-rqvm-qjhr
- `esbuild`: https://github.com/advisories/GHSA-g7r4-m6w7-qqqr

Repo conventions to follow:

- Use npm and `package-lock.json`.
- Keep dependency changes deliberate and scoped.
- This repo already uses `overrides` for transitive vulnerability response.
- Broad dependency changes require unit tests, typecheck, build, and CLI parity
  checks.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift check | `git diff --stat 277bca7..HEAD -- package.json package-lock.json docs/operations/PRODUCTION-APPROVAL-CHECKLIST.md .github/workflows/pr-validation.yml` | no in-scope drift, or reviewed drift with matching current state |
| Current audit | `npm audit --audit-level=high` | currently fails before this plan; exits 0 when done |
| Lock refresh | `npm install --package-lock-only` | exit 0; updates `package-lock.json` only |
| Clean install | `npm ci` | exit 0 |
| CLI parity | `npm run preflight:cli-parity` | exit 0 |
| Unit suite | `npm run test:unit` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `package-lock.json`
- `.github/workflows/pr-validation.yml` only if the team decides a clean audit
  should become CI-enforced in the same PR after the audit is clean.
- Production docs only if they need to record a temporary accepted exception.
  The preferred outcome is no docs exception.

**Out of scope**:

- Downgrading `drizzle-kit`.
- Running `npm audit fix --force`.
- Changing application source code to work around dependency updates unless a
  compile/test failure identifies a specific required compatibility change.
- Removing the production approval audit requirement.

## Git workflow

- Branch: `codex/004-resolve-high-critical-npm-audit`
- Commit message: `fix: resolve high severity npm audit advisories`
- Do not push or open a PR unless the operator instructs you to.

## Steps

### Step 1: Reproduce and save the current audit shape

Run:

```bash
npm audit --audit-level=high
```

Expected before edits: non-zero exit with `esbuild` and `shell-quote`
advisories. The exact count may drift; record the current count in your handoff.

**Verify**: command fails before edits with high/critical vulnerabilities.

### Step 2: Update the vulnerable override path deliberately

Inspect the current patched versions before editing:

```bash
npm view shell-quote@1 version
npm view esbuild versions --json
```

At plan time, the expected target is:

- `shell-quote` greater than `1.8.3`, likely `1.8.4` or newer in the same major.
- `esbuild` greater than `0.28.0`, likely `0.28.1` or newer.

In `package.json`, update the existing override:

```json
"esbuild": "0.28.1"
```

Use the newest non-vulnerable patch/minor that satisfies the current advisory
and works with the repo. If npm reports `0.28.1` is unavailable or still
vulnerable, pick the patched version indicated by the advisory and document it
in the handoff.

Do not add a direct root dependency on `esbuild` unless npm requires it. Prefer
the existing `overrides` mechanism.

**Verify**: `node -e "const p=require('./package.json'); console.log(p.overrides.esbuild)"` -> prints the patched esbuild version, not `0.28.0`.

### Step 3: Refresh the lockfile and resolve shell-quote

Run:

```bash
npm install --package-lock-only
```

Then inspect locked versions:

```bash
node - <<'NODE'
const lock=require('./package-lock.json')
for (const name of ['node_modules/esbuild','node_modules/shell-quote']) {
  console.log(name, lock.packages?.[name]?.version)
}
NODE
```

Expected:

- `node_modules/esbuild` is no longer `0.28.0`.
- `node_modules/shell-quote` is no longer `1.8.3`.

If `shell-quote` remains `1.8.3`, add a scoped npm override in `package.json`:

```json
"shell-quote": "1.8.4"
```

Then run `npm install --package-lock-only` again.

**Verify**: the node snippet prints non-vulnerable versions for both packages.

### Step 4: Confirm audit is clean

Run:

```bash
npm audit --audit-level=high
```

Expected: exit 0 and no high or critical vulnerabilities.

If audit is still dirty because `@esbuild-kit/core-utils` requires an older
`esbuild` range that cannot be safely overridden, stop and report. That path
likely requires upgrading `drizzle-kit` or the dependency that pulls
`@esbuild-kit/esm-loader`, and should not be improvised inside this plan.

**Verify**: `npm audit --audit-level=high` -> exit 0.

### Step 5: Run dependency validation

Run the validation set for broad dependency changes:

```bash
npm ci
npm run preflight:cli-parity
npm run test:unit
npm run typecheck
npm run build
```

Expected: all exit 0.

If `npm ci` fails due missing private package registry auth, stop and report the
auth blocker. Do not edit dependency versions to work around missing
`NODE_AUTH_TOKEN`.

**Verify**: all listed commands exit 0.

### Step 6: Decide whether to enforce audit in CI

After the audit is clean, decide with the maintainer whether to remove `|| true`
from `.github/workflows/pr-validation.yml`. If the instruction is to enforce it,
change the audit step to:

```yaml
npm audit --audit-level=high 2>&1 | tee audit-output.txt
```

If there is no explicit instruction to enforce CI in this PR, leave the workflow
unchanged and mention the clean audit in the handoff.

**Verify if changed**: `npm run check:conventions` -> exit 0.

## Test plan

- `npm audit --audit-level=high` must pass after dependency updates.
- `npm ci` must install the lockfile cleanly.
- `npm run preflight:cli-parity`, `npm run test:unit`, `npm run typecheck`, and
  `npm run build` must pass because dependency changes can affect CLI, Nitro,
  Vite, Drizzle, and Nuxt build paths.
- If CI enforcement is changed, run `npm run check:conventions`.

## Done criteria

All must hold:

- [ ] `package-lock.json` no longer locks `shell-quote@1.8.3`.
- [ ] `package-lock.json` no longer locks `esbuild@0.28.0`.
- [ ] `package.json` does not override `esbuild` to a vulnerable version.
- [ ] `npm audit --audit-level=high` exits 0.
- [ ] `npm ci` exits 0.
- [ ] `npm run preflight:cli-parity` exits 0.
- [ ] `npm run test:unit` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0.
- [ ] No source files are changed unless a validation failure proves a specific
      compatibility fix is required.

## STOP conditions

Stop and report back if:

- `npm audit fix --force` appears to be the only path offered. Do not run it.
- A clean audit requires downgrading `drizzle-kit` or another major tool.
- `npm ci` fails because private package registry auth is missing.
- `npm audit --audit-level=high` remains dirty after a patched override and
  lock refresh.
- A validation command fails twice after a reasonable fix attempt.

## Maintenance notes

The existing `esbuild` override pinned the repo to a vulnerable version. When
reviewing future override changes, check whether the override is still
advancing security posture or accidentally preventing patched transitive
versions. Keep the production checklist and CI audit behavior aligned so launch
evidence does not diverge from PR validation.
