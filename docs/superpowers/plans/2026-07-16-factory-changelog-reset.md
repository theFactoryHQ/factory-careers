# Factory Changelog Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the in-product changelog as a future-facing Factory Careers feature, establish a durable maintenance convention, and replace the active Reqcore-era release record with accurate Factory-owned history and release links.

**Architecture:** Keep `CHANGELOG.md` as the runtime source consumed by the authenticated updates API and archive the inherited Reqcore record under `docs/reference`. Extract Markdown parsing into a pure server utility so Factory baseline entries can be tested without loading a Nitro handler. Keep the existing version/update UI, but make its GitHub identity and manual instructions consistently point to `theFactoryHQ/factory-careers`.

**Tech Stack:** Markdown, Nuxt 4/Nitro, TypeScript, Vue 3, Vitest, release-please

---

### Task 1: Establish the repository changelog contract

**Files:**
- Modify: `tests/unit/agent-guidance.test.ts`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the failing guidance test**

Add these required snippets to the existing `agent guidance` test:

```ts
for (const snippet of [
  '## Changelog Maintenance',
  'Update `CHANGELOG.md` in the same change',
  'Added',
  'Changed',
  'Fixed',
  'Removed',
]) {
  expect(agents, `AGENTS.md missing ${snippet}`).toContain(snippet)
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `nvm use 22.22.0 && npm run test:unit -- tests/unit/agent-guidance.test.ts`

Expected: FAIL because `AGENTS.md` does not yet contain `## Changelog Maintenance`.

- [ ] **Step 3: Add the root guidance and keep both agent files identical**

Add this section to both root instruction files:

```md
## Changelog Maintenance

Treat the in-product changelog as part of the product. Update `CHANGELOG.md` in
the same change whenever work adds, changes, fixes, or removes behavior that a
recruiter, administrator, operator, integrator, or self-hoster would notice.

- Add entries under `## Unreleased` using **Added**, **Changed**, **Fixed**, or
  **Removed**.
- Write concise outcome-focused entries; do not paste commit titles or include
  routine refactors, tests, dependency bumps, or internal chores unless they
  materially affect users or operators.
- Keep release and commit links scoped to `theFactoryHQ/factory-careers`.
- Preserve inherited Reqcore history in its archive; do not mix new Factory
  Careers changes into the archived upstream record.
```

- [ ] **Step 4: Run the guidance test and verify GREEN**

Run: `nvm use 22.22.0 && npm run test:unit -- tests/unit/agent-guidance.test.ts`

Expected: PASS.

### Task 2: Create the Factory-era active changelog

**Files:**
- Move: `CHANGELOG.md` to `docs/reference/REQCORE_CHANGELOG.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Archive the inherited record**

Move the existing file without rewriting its historical entries. Replace its opening description with:

```md
# Reqcore Changelog Archive

This file preserves the changelog inherited from Reqcore through `v1.4.0` for
provenance and historical reference. It is not the active Factory Careers
changelog. Current product changes are recorded in [`CHANGELOG.md`](../../CHANGELOG.md).
```

- [ ] **Step 2: Create the active Factory Careers record**

Create a concise active `CHANGELOG.md` with:

```md
# Changelog

Notable Factory Careers product and operator changes are recorded here. The
inherited Reqcore record is preserved separately in
[`docs/reference/REQCORE_CHANGELOG.md`](docs/reference/REQCORE_CHANGELOG.md).

Entries follow [Keep a Changelog](https://keepachangelog.com) and focus on
outcomes visible to recruiters, administrators, operators, integrators, and
self-hosters.

## Unreleased

### Changed

- Re-established the changelog as a Factory Careers product record and corrected the update experience to use Factory-owned release sources.

## 2026-07-16 — Factory Careers baseline

This baseline summarizes the independent Factory Careers product built after
the Reqcore fork. Earlier inherited history remains available in the archive.

### Added

- Factory-branded public job board and application experience with configurable forms, private document uploads, source attribution, structured job descriptions, divisions, and salary visibility controls.
- Organization access controls for invitations, join requests, signup-domain allowlists, Microsoft SSO, role-based permissions, and tenant-scoped administration.
- Authenticated Factory Careers CLI with structured JSON output and agent-friendly automation for supported recruiting and system workflows.
- AI-assisted recruiting workflows for resume parsing, candidate analysis, scoring criteria, provider configuration, model discovery, and recruiter chatbot experiences.
- Microsoft and Google calendar integration paths for interview scheduling, invitations, responses, and synchronization.
- Operational validation for Render, Supabase Postgres, S3-compatible private storage, backups, release verification, and production environment contracts.

### Changed

- Repositioned the product from a branded Reqcore fork to Factory's hiring and applicant-tracking system, with Factory-owned product, security, deployment, and automation decisions.
- Improved dashboard responsiveness and navigation with shared caching, prefetching, keep-alive behavior, and lazy-loaded detail panels.
- Unified Factory branding and transactional email behavior across public, authentication, dashboard, and candidate communication surfaces.

### Fixed

- Hardened public application uploads, authorization boundaries, tenant isolation, dependency security, and production validation gates.
- Bundled the PDF parsing worker required to process candidate resumes reliably in production.
```

- [ ] **Step 3: Verify the record boundaries**

Run:

```bash
rg -n "reqcore-inc/reqcore" CHANGELOG.md
rg -n "Factory Careers baseline|## Unreleased" CHANGELOG.md
rg -n "v1.4.0|Reqcore Changelog Archive" docs/reference/REQCORE_CHANGELOG.md
```

Expected: no active upstream links; both active headings found; archived upstream release and archive heading found.

### Task 3: Parse Factory baseline entries and correct release identity

**Files:**
- Create: `tests/unit/changelog.test.ts`
- Create: `server/utils/changelog.ts`
- Modify: `server/api/updates/changelog.get.ts`
- Create: `tests/unit/factory-updates-identity.test.ts`
- Modify: `server/api/updates/version.get.ts`
- Modify: `app/pages/dashboard/updates.vue`
- Modify: `tests/unit/cli-parity-changed-files.test.ts`

- [ ] **Step 1: Write failing parser tests**

Test a pure `parseChangelog` helper with Markdown containing an Unreleased entry, a versioned release, and `## 2026-07-16 — Factory Careers baseline`. Assert that all three entries are returned, the baseline title is `Factory Careers baseline`, its date is `2026-07-16`, and its sections/items are retained.

- [ ] **Step 2: Run the parser test and verify RED**

Run: `nvm use 22.22.0 && npm run test:unit -- tests/unit/changelog.test.ts`

Expected: FAIL because `server/utils/changelog.ts` does not exist.

- [ ] **Step 3: Implement the pure parser and use it from the API**

Create:

```ts
export interface ChangelogEntry {
  title: string
  date: string | null
  version: string | null
  link: string | null
  sections: { heading: string; items: string[] }[]
}

export function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let currentSection: ChangelogEntry['sections'][number] | null = null

  for (const line of raw.split('\n')) {
    const versionHeading = line.match(/^## \[(.+?)]\((.+?)\)\s*\((.+?)\)/)
    const unreleasedHeading = line.match(/^## Unreleased\s*$/)
    const datedHeading = line.match(/^## (\d{4}-\d{2}-\d{2})(?:\s+[—-]\s+(.+))?\s*$/)

    if (versionHeading || unreleasedHeading || datedHeading) {
      if (current) entries.push(current)

      if (versionHeading) {
        current = {
          title: `v${versionHeading[1]}`,
          version: versionHeading[1] ?? null,
          date: versionHeading[3] ?? null,
          link: versionHeading[2] ?? null,
          sections: [],
        }
      }
      else if (unreleasedHeading) {
        current = { title: 'Unreleased', version: null, date: null, link: null, sections: [] }
      }
      else {
        const date = datedHeading?.[1] ?? null
        current = {
          title: datedHeading?.[2]?.trim() || date || '',
          version: null,
          date,
          link: null,
          sections: [],
        }
      }
      currentSection = null
      continue
    }

    const sectionHeading = line.match(/^### (.+)/)
    if (sectionHeading && current) {
      currentSection = { heading: sectionHeading[1] ?? '', items: [] }
      current.sections.push(currentSection)
      continue
    }

    const item = line.match(/^\s*[*-]\s+(.+)/)
    if (item && currentSection) currentSection.items.push(item[1] ?? '')
  }

  if (current) entries.push(current)

  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.title}-${entry.date}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```

Update the handler to read `CHANGELOG.md`, call `parseChangelog(raw)`, and return those entries with `currentVersion`.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `nvm use 22.22.0 && npm run test:unit -- tests/unit/changelog.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing Factory identity tests**

Read the version handler and update page as text, then assert:

```ts
expect(versionRoute).toContain("const owner = 'theFactoryHQ'")
expect(versionRoute).toContain("const repo = 'factory-careers'")
expect(versionRoute).toContain("'User-Agent': `Factory-Careers/${currentVersion}`")
expect(updatesPage).toContain('cd /path/to/factory-careers')
expect(updatesPage).toContain('https://github.com/theFactoryHQ/factory-careers/releases')
expect(updatesPage).not.toContain('/path/to/reqcore')
expect(updatesPage).not.toContain('caffeinebounce/factory-careers/releases')
```

- [ ] **Step 6: Run identity tests and verify RED**

Run: `nvm use 22.22.0 && npm run test:unit -- tests/unit/factory-updates-identity.test.ts`

Expected: FAIL against the inherited owner, user-agent, manual path, and footer link.

- [ ] **Step 7: Correct the Factory-owned update experience**

Point `/api/updates/version` to `theFactoryHQ/factory-careers`, use `Factory-Careers/<version>` as the GitHub API user-agent, change the manual path to `/path/to/factory-careers`, change the footer to `https://github.com/theFactoryHQ/factory-careers/releases`, and update the page description to mention Factory Careers releases and product changes.

Add a CLI parity evidence case covering the changelog route refactor and its unit test without changing the public CLI response contract.

- [ ] **Step 8: Run focused behavior tests and verify GREEN**

Run:

```bash
nvm use 22.22.0 && npm run test:unit -- \
  tests/unit/changelog.test.ts \
  tests/unit/factory-updates-identity.test.ts \
  tests/unit/cli-system-commands.test.ts \
  tests/unit/cli-parity-changed-files.test.ts
```

Expected: PASS.

### Task 4: Validate conventions, contracts, types, and build

**Files:**
- Review all files changed above

- [ ] **Step 1: Run convention and CLI parity checks**

Run:

```bash
nvm use 22.22.0 && npm run check:conventions
nvm use 22.22.0 && npm run preflight:cli-parity
```

Expected: both PASS.

- [ ] **Step 2: Run the full unit suite**

Run: `nvm use 22.22.0 && npm run test:unit`

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck and production build**

Run:

```bash
nvm use 22.22.0 && npm run typecheck
nvm use 22.22.0 && npm run build
```

Expected: both exit 0.

- [ ] **Step 4: Review final scope**

Run:

```bash
git status --short --branch
git diff --check
git diff --stat
git diff -- AGENTS.md CLAUDE.md CHANGELOG.md docs/reference/REQCORE_CHANGELOG.md server/utils/changelog.ts server/api/updates/changelog.get.ts server/api/updates/version.get.ts app/pages/dashboard/updates.vue tests/unit
```

Expected: only changelog policy, archive/content, parser/API, Factory identity, tests, and this plan are changed; no unrelated worktree files appear.
