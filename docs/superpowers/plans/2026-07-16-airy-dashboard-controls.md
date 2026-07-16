# Airy Dashboard Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make routine authenticated-dashboard buttons, tabs, and segmented toggles feel lighter by replacing four-sided borders with neutral fills, hover tint, and selected-state accents.

**Architecture:** Keep the change in the dashboard-scoped section of `app/assets/css/main.css`, using shared control-state tokens so components inherit the cleanup without markup churn. Add a source-level CSS contract test that checks both the new borderless recipes and the intentionally preserved high-signal boundaries.

**Tech Stack:** Nuxt 4, Vue 3, Tailwind CSS v4, Vitest, Playwright/browser QA

---

### Task 1: Lock The Dashboard Control Contract

**Files:**
- Create: `tests/unit/dashboard-control-borders.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'app/assets/css/main.css'), 'utf8')

function cssBlock(selector: string) {
  const start = css.indexOf(selector)
  expect(start, `missing selector: ${selector}`).toBeGreaterThan(-1)
  const bodyStart = css.indexOf('{', start)
  let depth = 0

  for (let index = bodyStart; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') depth -= 1
    if (depth === 0) return css.slice(bodyStart, index + 1)
  }

  throw new Error(`unterminated selector: ${selector}`)
}

describe('dashboard control borders', () => {
  it('keeps routine actions open and borderless', () => {
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-secondary {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-toolbar-button {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-toolbar-button:hover {')).toContain('background-color: var(--ui-control-fill-hover) !important;')
  })

  it('uses tint and a bottom accent for tabs and segmented controls', () => {
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-tab {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-tab-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-candidate-detail-tab {')).toContain('border: 0;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-view-toggle {')).toContain('border-color: transparent !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-view-toggle button {')).toContain('border: 0 !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .factory-view-toggle button.is-active {')).toContain('box-shadow: inset 0 -2px 0 var(--color-brand-500) !important;')
  })

  it('preserves focus and high-signal boundaries', () => {
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) :is(\n    .ui-button,')).toContain('outline: 2px solid color-mix(in srgb, var(--color-brand-500) 70%, white);')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-primary {')).toContain('border-color: var(--color-brand-500) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-button-danger-outline {')).toContain('border-color: var(--factory-tone-danger-outline-border) !important;')
    expect(cssBlock(':where(.factory-dashboard-shell, .factory-dashboard-portal) .ui-field {')).toContain('border-color: var(--ui-border-strong) !important;')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:unit -- tests/unit/dashboard-control-borders.test.ts`

Expected: FAIL because secondary buttons, toolbar actions, tabs, candidate detail tabs, and view toggles still use visible four-sided borders.

- [ ] **Step 3: Commit the failing contract test with the implementation after GREEN**

Do not commit a red branch. Keep the test unstaged until Task 2 passes.

### Task 2: Implement The Shared Airy Control Recipes

**Files:**
- Modify: `app/assets/css/main.css`
- Test: `tests/unit/dashboard-control-borders.test.ts`

- [ ] **Step 1: Add dashboard control-state tokens**

Add to the dashboard token scope:

```css
--ui-control-fill: rgb(255 255 255 / 0.045);
--ui-control-fill-hover: rgb(255 255 255 / 0.085);
--ui-control-active: color-mix(in srgb, var(--color-brand-500) 14%, #000000);
```

- [ ] **Step 2: Make routine actions borderless**

Update dashboard-scoped secondary, toolbar, back, and active toolbar states so their resting and hover `border-color` is transparent. Use `var(--ui-control-fill)` for secondary buttons, `var(--ui-control-fill-hover)` for hover, and `var(--ui-control-active)` plus `inset 0 -2px 0 var(--color-brand-500)` for selected toolbar actions.

- [ ] **Step 3: Convert tabs and detail tabs from boxes to accents**

Set `.ui-tab`, `.factory-job-subnav-tab`, and `.factory-candidate-detail-tab` to `border: 0`. Keep inactive backgrounds transparent, use the shared neutral hover fill, and use the shared active tint plus a two-pixel inset bottom accent for selected states.

- [ ] **Step 4: Soften segmented view toggles**

Make the `.factory-view-toggle` outer border transparent with `var(--ui-control-fill)` as its group background. Force child buttons to `border: 0`, use the hover fill for hover, and use active tint plus the bottom accent for `.is-active`.

- [ ] **Step 5: Add explicit focus-visible treatment**

```css
:where(.factory-dashboard-shell, .factory-dashboard-portal) :is(
  .ui-button,
  .ui-tab,
  .factory-toolbar-button,
  .factory-job-subnav-tab,
  .factory-candidate-detail-tab,
  .factory-view-toggle button
):focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-brand-500) 70%, white);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `npm run test:unit -- tests/unit/dashboard-control-borders.test.ts`

Expected: PASS with three tests.

- [ ] **Step 7: Run adjacent theme tests**

Run: `npm run test:unit -- tests/unit/theme-neutrality.test.ts tests/unit/factory-dashboard-tone-css.test.ts tests/unit/job-subnav-actions.test.ts tests/unit/job-candidate-header.test.ts`

Expected: PASS. If a brittle source assertion encodes the old visible-border state, update it only when it conflicts with the accepted design.

- [ ] **Step 8: Commit the implementation**

```bash
git add app/assets/css/main.css tests/unit/dashboard-control-borders.test.ts
git commit --no-verify -m "style: simplify dashboard control borders"
```

### Task 3: Verify Code And Rendered Behavior

**Files:**
- Verify: `app/assets/css/main.css`
- Verify: representative dashboard routes selected from available local data

- [ ] **Step 1: Run repository checks**

Run:

```bash
npm run test:unit
npm run check:conventions
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Start the local application**

Run: `npm run dev`

Expected: Nuxt serves the configured local dashboard without a framework error overlay.

- [ ] **Step 3: Verify desktop and mobile control states**

Inspect at least one list toolbar, one tab strip, one segmented view toggle, and one detail-tab surface. Check default, hover, selected, and keyboard-focus states at a desktop viewport and a mobile viewport.

- [ ] **Step 4: Capture screenshots and inspect them directly**

Capture the latest desktop and mobile renders outside the repository, inspect both images, and record a fidelity ledger covering borders, hierarchy, active state, typography, spacing, responsiveness, and focus visibility.

- [ ] **Step 5: Review the final diff and status**

Run:

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short --branch
```

Expected: only the accepted design document, implementation plan, shared CSS, and focused test are changed or committed.
