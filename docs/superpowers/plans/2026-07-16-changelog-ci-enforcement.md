# Changelog CI Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce curated changelog entries in pull requests and publish the matching versioned changelog section as every GitHub Release body.

**Architecture:** Put changelog parsing in one dependency-free module shared by finalization, PR validation, and release-note extraction. Run the validator in both local PR preflight and GitHub PR Validation, then use the extractor after release-please publishing and as a defense-in-depth published-release check.

**Tech Stack:** Node.js ESM, Vitest, Git, GitHub Actions, release-please, GitHub CLI

---

## Task 1: Define the changelog parser and policy

**Files:**
- Create: `tests/unit/changelog-policy.test.ts`
- Create: `scripts/changelog-format.mjs`
- Create: `scripts/validate-changelog.mjs`
- Modify: `scripts/finalize-changelog.mjs`

- [ ] **Step 1: Write failing parser and policy tests**

Test `getUnreleasedItems`, `getReleaseNotes`, and `validateChangelogPolicy` with
fixtures covering a new ordinary-PR item, a missing changelog update, a
`skip-changelog` exception, a finalized version bump, a populated Unreleased
section on a release PR, and a missing version section.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/changelog-policy.test.ts
```

Expected: FAIL because `scripts/changelog-format.mjs` and
`scripts/validate-changelog.mjs` do not exist.

- [ ] **Step 3: Implement shared parsing and policy**

Implement these dependency-free interfaces (shown as declarations so the
expected inputs and outputs are exact):

```ts
export function getUnreleasedItems(raw: string): string[]
export function getReleaseNotes(raw: string, version: string): string
export function hasChangelogItem(body: string): boolean
export function validateChangelogPolicy(input: {
  changedFiles: string[]
  baseChangelog: string
  currentChangelog: string
  baseVersion: string
  currentVersion: string
  skip: boolean
}): 'no-changes' | 'skipped' | 'pull-request' | 'release'
```

The policy must evaluate a version change before the skip flag, require a new
Unreleased item for ordinary PRs, and require a matching non-empty version
section plus empty Unreleased for release PRs. Refactor the existing finalizer
to import `hasChangelogItem` so all tools use the same category grammar.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/changelog-policy.test.ts tests/unit/finalize-changelog.test.ts
```

Expected: both test files pass.

## Task 2: Add executable PR and release-note commands

**Files:**
- Modify: `tests/unit/changelog-policy.test.ts`
- Create: `scripts/extract-release-notes.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing CLI tests**

Create temporary Git repositories to prove `changelog:check` compares against a
base ref and reports a missing entry, and prove the extractor writes only the
matching release body to stdout while rejecting an unknown version.

- [ ] **Step 2: Run the CLI tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/changelog-policy.test.ts
```

Expected: FAIL because the command entry points and package scripts are absent.

- [ ] **Step 3: Implement the command entry points**

Add package scripts:

```json
"changelog:check": "node scripts/validate-changelog.mjs",
"changelog:extract": "node scripts/extract-release-notes.mjs"
```

The validator reads `PR_PREFLIGHT_BASE_REF` (default `origin/main`), fetches a
missing remote base without tags, and accepts `CHANGELOG_SKIP=true`. The
extractor accepts exactly one `MAJOR.MINOR.PATCH` argument and emits the parsed
release body.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/changelog-policy.test.ts tests/unit/finalize-changelog.test.ts
```

Expected: both test files pass.

## Task 3: Wire blocking pull-request validation

**Files:**
- Modify: `tests/unit/git-hooks-preflight.test.ts`
- Modify: `tests/unit/factory-release-identity.test.ts`
- Modify: `scripts/run-pr-validation-preflight.mjs`
- Modify: `.github/workflows/pr-validation.yml`

- [ ] **Step 1: Write failing workflow-contract tests**

Require `Changelog policy` to be the first local preflight step and require PR
Validation to run `npm run changelog:check` with the base ref and a
`skip-changelog` label expression.

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/git-hooks-preflight.test.ts tests/unit/factory-release-identity.test.ts
```

Expected: FAIL because neither preflight surface runs the policy.

- [ ] **Step 3: Wire both validation surfaces**

Add the validator before CLI parity in local preflight. Add a named PR
Validation step with `PR_PREFLIGHT_BASE_REF` and `CHANGELOG_SKIP` populated from
the pull request labels, and include its outcome in the job summary.

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run the same two-file Vitest command. Expected: both files pass.

## Task 4: Publish curated notes and fail closed

**Files:**
- Modify: `tests/unit/factory-release-identity.test.ts`
- Modify: `.github/workflows/release-please.yml`
- Modify: `.github/workflows/release-verification.yml`

- [ ] **Step 1: Write failing release-workflow tests**

Require release-please to have an `id`, checkout the created tag, extract the
matching notes, and call `gh release edit --notes-file`. Require published
release verification to repeat the extraction and demote a release when that
contract fails. Require the missing-token branch to exit nonzero.

- [ ] **Step 2: Run the release tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/factory-release-identity.test.ts
```

Expected: FAIL because release notes are not sourced from the curated changelog
and the missing-token path currently succeeds.

- [ ] **Step 3: Implement release workflow enforcement**

Use `steps.release.outputs.release_created`, `tag_name`, and `version` from the
root release-please component. On release creation, check out the tag, extract
the version section to a temporary Markdown file, and update the GitHub Release.
In Release Verification, make the changelog-note job a prerequisite for smoke
testing and demote published releases when extraction or publication fails.

- [ ] **Step 4: Run the release tests and verify GREEN**

Run the same one-file Vitest command. Expected: the file passes.

## Task 5: Document the enforced workflow and record the change

**Files:**
- Modify: `tests/unit/agent-guidance.test.ts`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.github/pull_request_template.md`
- Modify: `docs/reference/VERSIONING.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing documentation-contract tests**

Require synchronized agent guidance to name `skip-changelog`, explain that
release PRs cannot skip finalization, and state that the curated version section
becomes the GitHub Release body. Require the PR template and versioning guide to
describe the same contract.

- [ ] **Step 2: Run the documentation tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/agent-guidance.test.ts tests/unit/factory-release-identity.test.ts
```

Expected: FAIL because the current files describe guidance but not enforcement.

- [ ] **Step 3: Update synchronized guidance and changelog**

Document the label exception, local environment equivalent, mandatory release
finalization, and curated note publishing. Add an outcome-focused entry under
`CHANGELOG.md` `Changed` describing the new release integrity gate.

- [ ] **Step 4: Run focused documentation and convention checks**

Run:

```bash
npm run test:unit -- tests/unit/agent-guidance.test.ts tests/unit/factory-release-identity.test.ts
npm run check:conventions
```

Expected: all checks pass.

## Task 6: Full validation and review

**Files:**
- Review all files changed by Tasks 1-5.

- [ ] **Step 1: Exercise failure and success paths directly**

Run `npm run changelog:check` against the branch, run extraction for `1.0.0`,
and run a temporary-fixture release validation failure for a missing version.

- [ ] **Step 2: Run repository validation**

Run:

```bash
npm run test:unit
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits zero.

- [ ] **Step 3: Critically review the diff**

Check that release PRs cannot bypass the policy, ordinary PR exceptions require
an explicit label, release notes come from the tagged changelog, workflows have
the necessary permissions, and no inherited Reqcore identity is reintroduced.

- [ ] **Step 4: Commit and send through review**

Stage only the scoped files, commit with `ci: enforce curated changelog releases`,
push `codex/changelog-ci`, open a ready-for-review PR with validation and release
notes, register the OpenClaw review loop, and address actionable review feedback
before merge.
