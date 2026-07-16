# Factory Version Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Factory Careers `v1.0.0` as the independent app-and-CLI baseline, make release availability explicit in the Updates experience, and prepare future Semantic Versioning releases without importing Reqcore history.

**Architecture:** Keep `package.json` as the runtime application version source and synchronize the CLI, npm lockfile, and release-please manifest to the same baseline. Move GitHub release lookup into a typed server utility that distinguishes a missing first release from transient lookup failures. Present that status in the existing Nuxt Updates page, version the Factory baseline changelog entry, and hide empty Unreleased entries until a user-facing change is recorded.

**Tech Stack:** Nuxt 4, Nitro, Vue 3, TypeScript, npm workspaces, release-please, Vitest, GitHub Actions

---

### Task 1: Establish the Factory `v1.0.0` metadata contract

**Files:**
- Create: `tests/unit/factory-release-identity.test.ts`
- Modify: `package.json`
- Modify: `packages/careers-cli/package.json`
- Modify: `package-lock.json`
- Modify: `.release-please-manifest.json`
- Modify: `.github/release-please-config.json`
- Create: `docs/reference/VERSIONING.md`

- [ ] **Step 1: Write the failing release identity test**

Read the root package, CLI package, npm lockfile, release manifest, release-please config, changelog, and versioning guide. Assert that the root, CLI, root lockfile package, workspace lockfile package, and release manifest all equal `1.0.0`; that release-please updates both CLI version locations through `extra-files`; and that the versioning guide defines patch, minor, and major release rules.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/factory-release-identity.test.ts
```

Expected: FAIL because active metadata still reports `1.4.0` and the versioning guide does not exist.

- [ ] **Step 3: Reset metadata with npm and configure future synchronized releases**

Run `npm version 1.0.0 --no-git-tag-version`, set `packages/careers-cli/package.json` to `1.0.0`, and regenerate the lockfile with `npm install --package-lock-only --ignore-scripts`. Set `.release-please-manifest.json` to `1.0.0`. Configure these release-please `extra-files` entries:

```json
[
  {
    "type": "json",
    "path": "packages/careers-cli/package.json",
    "jsonpath": "$.version"
  },
  {
    "type": "json",
    "path": "package-lock.json",
    "jsonpath": "$.packages[\"packages/careers-cli\"].version"
  }
]
```

- [ ] **Step 4: Document the Factory release policy**

Create `docs/reference/VERSIONING.md` defining `v1.0.0` as the Factory cutover, compatible fixes as patch releases, compatible product/API/CLI additions as minor releases, and incompatible API/CLI/configuration/data-contract changes as major releases. State that app and CLI versions remain synchronized until a separate CLI compatibility policy is deliberately introduced. Document the manual first release and the `RELEASE_PLEASE_TOKEN` prerequisite tracked by issue `#27`.

- [ ] **Step 5: Run the release identity test and verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/factory-release-identity.test.ts
```

Expected: PASS.

### Task 2: Distinguish unpublished and unavailable GitHub release states

**Files:**
- Create: `tests/unit/factory-release-status.test.ts`
- Create: `server/utils/factoryRelease.ts`
- Modify: `server/api/updates/version.get.ts`
- Modify: `tests/unit/factory-updates-identity.test.ts`
- Modify: `tests/unit/cli-system-commands.test.ts`
- Modify: `docs/CLI.md`

- [ ] **Step 1: Write failing release lookup tests**

Test `fetchLatestFactoryRelease()` with injected fetch implementations. A `200` response returns `published` plus the release payload; a `404` returns `unpublished`; any other non-success response, malformed payload, or thrown fetch returns `unavailable`.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/factory-release-status.test.ts tests/unit/factory-updates-identity.test.ts tests/unit/cli-system-commands.test.ts
```

Expected: FAIL because the release utility and structured `releaseStatus` contract do not exist.

- [ ] **Step 3: Implement the typed release lookup utility**

Create a server utility with these public shapes:

```ts
export type FactoryReleaseLookup =
  | { status: 'published'; release: FactoryGithubRelease }
  | { status: 'unpublished' | 'unavailable' }

export async function fetchLatestFactoryRelease(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FactoryReleaseLookup>
```

Use `theFactoryHQ/factory-careers`, the Factory user agent, a 10-second timeout, and explicit payload validation. Treat only `404` as an unpublished first release.

- [ ] **Step 4: Return an explicit API status**

Update the route so every response includes one of:

```ts
releaseStatus: 'current' | 'update-available' | 'unpublished' | 'unavailable'
```

Published releases retain the existing version comparison, URL, notes, and publication date. Unpublished and unavailable states retain null release metadata without claiming the current installation is up to date.

- [ ] **Step 5: Preserve CLI parity**

Update the CLI system command fixture to use `v1.0.0` data and assert that `releaseStatus` passes through unchanged. Add the response field and meanings to `docs/CLI.md`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/factory-release-status.test.ts tests/unit/factory-updates-identity.test.ts tests/unit/cli-system-commands.test.ts
```

Expected: PASS.

### Task 3: Make the Updates UI a complete Factory release surface

**Files:**
- Modify: `tests/unit/changelog.test.ts`
- Modify: `tests/unit/factory-updates-identity.test.ts`
- Modify: `server/utils/changelog.ts`
- Modify: `app/pages/dashboard/updates.vue`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing UI and parser tests**

Require the Updates page to branch on `releaseStatus`, display `No Factory release published yet` for `unpublished`, retain `Unable to check` for `unavailable`, and show `Not published` instead of a misleading latest version. Extend the parser test so an empty `Unreleased` heading is omitted while a populated one remains.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/changelog.test.ts tests/unit/factory-updates-identity.test.ts
```

Expected: FAIL because the current UI infers status from `latestVersion` and the parser retains empty entries.

- [ ] **Step 3: Version the Factory baseline changelog**

Keep an empty `## Unreleased` heading, then use this Factory release heading:

```markdown
## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)
```

Move the changelog reset, release-source correction, and first-release-state correction into the baseline sections so the future Unreleased area starts clean.

- [ ] **Step 4: Hide empty changelog entries**

Filter parsed entries that contain no section items. Preserve ordering, de-duplication, version metadata, and populated Unreleased entries.

- [ ] **Step 5: Render explicit release-state copy**

Use `releaseStatus` for icon, color, heading, description, and latest-version presentation. The unpublished copy must explain that local `v1.0.0` is the Factory baseline and the GitHub release is pending. The unavailable copy must remain a network/service failure, and the published-current state must remain successful.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/changelog.test.ts tests/unit/factory-updates-identity.test.ts
```

Expected: PASS.

### Task 4: Verify contracts, runtime behavior, and production output

**Files:**
- Modify: `tests/unit/cli-parity-changed-files.test.ts` only if the changed-file guard requires explicit evidence

- [ ] **Step 1: Run focused contract checks**

Run:

```bash
npm run check:conventions
npm run preflight:cli-parity
```

Expected: both commands pass with CLI parity evidence.

- [ ] **Step 2: Run the full automated gate**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all unit tests pass; typecheck and build exit zero; the resume parser bundle smoke test passes.

- [ ] **Step 3: Run authenticated Safari QA**

Start the Nuxt dev server with the existing local environment on an unused port. In Safari's Factory profile, verify `/dashboard/updates` shows `v1.0.0`, `No Factory release published yet`, no `v1.4.0`, a current `v1.0.0` changelog card, working expand/collapse, Factory manual paths, and the Factory GitHub release link. Confirm no relevant runtime errors in server output.

- [ ] **Step 4: Perform a critical diff review**

Inspect all changed files, run `git diff --check`, search active release surfaces for `1.4.0`, confirm no remote Factory tags predate the cutover, and classify remaining `reqcore` strings as archived history or compatibility identifiers rather than active release identity.

### Task 5: Deliver, review, merge, and publish the baseline release

**Files:**
- No additional production files unless review feedback requires changes

- [ ] **Step 1: Commit the scoped implementation**

Stage only planned files and commit with:

```bash
git commit --no-verify -m "feat: establish Factory v1.0.0 lineage"
```

- [ ] **Step 2: Request an independent code review**

Review the commit range from `origin/main` to `HEAD` against this plan. Resolve every Critical or Important issue and rerun affected checks.

- [ ] **Step 3: Push and open a draft PR**

Push `codex/factory-version-1`, open a Conventional Commit titled PR with summary, validation, risks, release/version notes, and the OpenClaw review-loop marker. Register the PR with the trusted local review helper and add `review-loop:codex` when available.

- [ ] **Step 4: Complete the review cycle**

Monitor CI and review threads. Address actionable Sparks, Kai, Copilot, or human feedback, push fixes, rerun affected validation, and request review again until CI is green and no actionable thread remains.

- [ ] **Step 5: Merge and publish `v1.0.0`**

Merge the approved PR using the repository-supported strategy, verify the merged commit on `main`, then create the first GitHub release/tag `v1.0.0` from merged `main` with the Factory baseline notes. Monitor Docker publication and release verification; do not call the release healthy until both workflows pass.

- [ ] **Step 6: Verify the live release contract**

Confirm GitHub marks `v1.0.0` as the latest release, the release endpoint returns `v1.0.0`, required assets are attached after verification, and local/remote `main` contain the merged work. Preserve unrelated primary-checkout files and clean up the owned worktree only after the release is verified.
