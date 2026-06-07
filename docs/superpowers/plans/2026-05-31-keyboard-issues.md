# Remaining Keyboard Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining open keyboard-navigation issues: #47 regression harness/audit matrix and #53 complex dashboard controls.

**Architecture:** Build the test harness first so dashboard-control fixes land with executable evidence. Reuse the existing primitives in `app/composables/useMenuButton.ts`, `app/composables/useListboxNavigation.ts`, `app/composables/useFocusTrap.ts`, and `app/composables/useOutsidePointer.ts`; extend them only when a repeated control need is missing. Convert bespoke dropdowns/popovers to those primitives, then add Playwright coverage around the actual dashboard workflows.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Playwright, Vitest, optional `@axe-core/playwright`.

---

## Current Issue Review

Open keyboard-navigation issues as of 2026-05-31:

- #47 `[keyboard] Add accessibility test harness and keyboard audit matrix` is open, priority p1, and tracks Playwright keyboard specs, axe checks, DevTools removal from Tab order, and CI failure on regressions.
- #53 `[keyboard] Fix complex dashboard controls` is open, priority p2, and tracks `FactorySelect`, `ColumnsMenu`, `SavedViewsMenu`, `PropertyFilterBar`, `PropertySchemaEditor`, `PropertyValueEditor`, and schedule/timezone controls.

Closed keyboard issues already covered: #48 shared primitives, #49 public listboxes/language picker, #50 top-bar menus, #51 drawers/sidebars/modals, #52 dashboard tables, #54 PR checklist/docs. Memory also mentioned #137, #145, and #156, but live GitHub now shows all three closed and not keyboard-labeled.

## File Map

- Modify `package.json`: add an `npm run test:e2e:a11y` script for the new keyboard/a11y lane.
- Modify `e2e/fixtures.ts`: add keyboard helpers for focus assertions, keyboard listbox/menu selection, and optional axe scanning.
- Create `e2e/accessibility/keyboard-regression.spec.ts`: smoke the cross-app keyboard matrix for public/auth/dashboard shells, tables, drawers, menus, modals, and scheduling.
- Create `e2e/accessibility/dashboard-controls.spec.ts`: focused coverage for #53 dashboard controls.
- Modify `app/composables/useMenuButton.ts`: add ArrowUp open, basic roving menu item support, Tab close behavior, and focus restore options needed by dashboard menus.
- Modify `app/components/ColumnsMenu.vue`: replace the pointer-only custom menu with `useMenuButton` and menu roles.
- Modify `app/components/SavedViewsMenu.vue`: replace one-off document listeners with `useMenuButton`, add keyboard-open/focus-restore behavior, and keep the save form Escape semantics.
- Modify `app/components/PropertyFilterBar.vue`: add keyboard handling to add/edit popovers, focus first actionable control on open, Escape close with trigger focus restore, and ensure multi-select option chips are reachable.
- Modify `app/components/PropertyValueEditor.vue`: make teleported select/multi-select popovers menu/listbox-compatible by keyboard and restore focus to the inline trigger after commit/cancel.
- Modify `app/components/PropertySchemaEditor.vue`: add drawer focus handling if missing, make drag-only reorder have keyboard alternatives, and ensure add/edit/delete/option controls are reachable.
- Modify `app/components/InterviewScheduleSidebar.vue`: audit and fix the timezone dropdown/scheduling controls under the same menu/listbox expectations.
- Modify `.github/workflows/*` only if the existing Playwright workflow does not already include the new a11y lane.
- Modify `tests/unit/shared-popover-primitives.test.ts` or add focused unit tests if composable contracts change.

---

### Task 1: Harness Inventory and Script

**Files:**
- Modify: `package.json`
- Modify: `e2e/fixtures.ts`
- Create: `e2e/accessibility/keyboard-regression.spec.ts`

- [ ] **Step 1: Add the a11y lane script**

In `package.json`, add:

```json
"test:e2e:a11y": "NUXT_DEVTOOLS=false playwright test e2e/accessibility --workers=1"
```

Expected: the script sits near the other `test:e2e:*` scripts.

- [ ] **Step 2: Add keyboard helpers**

In `e2e/fixtures.ts`, add helpers:

```ts
export async function expectVisibleFocus(page: Page) {
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    const styles = window.getComputedStyle(el)
    return {
      tagName: el.tagName,
      label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      boxShadow: styles.boxShadow,
    }
  })
  expect(outline).not.toBeNull()
  expect(
    outline!.outlineStyle !== 'none'
      || outline!.outlineWidth !== '0px'
      || outline!.boxShadow !== 'none',
  ).toBeTruthy()
}

export async function openWithKeyboard(page: Page, label: string | RegExp) {
  const trigger = page.getByRole('button', { name: label })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}
```

- [ ] **Step 3: Create the audit matrix spec skeleton**

Create `e2e/accessibility/keyboard-regression.spec.ts` with tests that first prove the harness runs:

```ts
import { test, expect, expectVisibleFocus } from '../fixtures'

test.describe('keyboard regression matrix', () => {
  test('public jobs page keeps controls keyboard reachable', async ({ page }) => {
    await page.goto('/jobs')
    await page.getByLabel('Search jobs').focus()
    await expect(page.getByLabel('Search jobs')).toBeFocused()
    await expectVisibleFocus(page)
  })

  test('auth sign-in form is reachable by Tab', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectVisibleFocus(page)
  })
})
```

- [ ] **Step 4: Verify the new lane runs**

Run:

```bash
npm run test:e2e:a11y
```

Expected: the new spec runs. If local env is not prepared, capture the exact missing env/service blocker before continuing.

### Task 2: Extend Shared Menu/Listbox Behavior

**Files:**
- Modify: `app/composables/useMenuButton.ts`
- Modify: `app/composables/useListboxNavigation.ts` only if needed
- Modify: `tests/unit/shared-popover-primitives.test.ts`

- [ ] **Step 1: Write a unit contract for menu keyboard expectations**

Extend `tests/unit/shared-popover-primitives.test.ts` to assert `useMenuButton.ts` contains support for:

```ts
expect(menuButton).toContain("event.key === 'ArrowUp'")
expect(menuButton).toContain("event.key === 'Tab'")
expect(menuButton).toContain('focusFirstMenuItem')
expect(menuButton).toContain('focusLastMenuItem')
expect(menuButton).toContain('focusTrigger')
```

- [ ] **Step 2: Add missing menu behavior**

In `app/composables/useMenuButton.ts`, add `focusLastMenuItem`, open-on-ArrowUp, Tab close, and simple ArrowUp/ArrowDown roving among menu items. Keep the public return shape backward-compatible.

- [ ] **Step 3: Run unit proof**

Run:

```bash
npm run test:unit -- tests/unit/shared-popover-primitives.test.ts
```

Expected: PASS.

### Task 3: Fix Bespoke Dashboard Menus

**Files:**
- Modify: `app/components/ColumnsMenu.vue`
- Modify: `app/components/SavedViewsMenu.vue`
- Modify: `app/components/ConversationItem.vue`
- Create or modify: `e2e/accessibility/dashboard-controls.spec.ts`

- [ ] **Step 1: Add failing Playwright coverage for Columns and Saved Views**

Create `e2e/accessibility/dashboard-controls.spec.ts` with authenticated tests that navigate to candidate and jobs dashboard pages, then open `Columns` and `Views` with Enter/Space, move through menu items with Arrow keys, close with Escape, and assert focus returns to the trigger.

- [ ] **Step 2: Refactor `ColumnsMenu.vue`**

Replace `open`, `menuRef`, and document click listeners with `useMenuButton({ id: 'columns-menu' })`. Add `aria-label="Columns"`, `aria-controls`, `role="menu"`, `role="menuitemcheckbox"`, `aria-checked`, `@keydown="menu.onMenuKeydown"`, and trigger `@keydown="menu.onTriggerKeydown"`.

- [ ] **Step 3: Refactor `SavedViewsMenu.vue`**

Use `useMenuButton({ id: 'saved-views-menu' })` for trigger/menu state, keep `openSaveForm()` focusing `nameInput`, and make Escape inside the save input close only the form first. Add `role="menuitem"` to selectable view buttons and `aria-label` to icon-only save/default/delete controls.

- [ ] **Step 4: Audit `ConversationItem.vue`**

Add `aria-label="Conversation actions"`, `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, `role="menuitem"`, keyboard-open support for the action button, Escape close, and focus restore. If parent-managed state makes `useMenuButton` awkward, keep the state in `ChatbotSidebar.vue` but use the same keyboard contract.

- [ ] **Step 5: Verify**

Run:

```bash
npm run test:e2e:a11y -- e2e/accessibility/dashboard-controls.spec.ts
```

Expected: Columns, Saved Views, and Conversation menu cases pass.

### Task 4: Fix Property Controls

**Files:**
- Modify: `app/components/PropertyFilterBar.vue`
- Modify: `app/components/PropertyValueEditor.vue`
- Modify: `app/components/PropertySchemaEditor.vue`
- Modify: `e2e/accessibility/dashboard-controls.spec.ts`

- [ ] **Step 1: Expand dashboard-control E2E coverage**

Add tests that open the property filter picker, edit a filter chip, edit a select property value, edit a multi-select property value, open the property schema drawer, and add/remove an option without pointer use.

- [ ] **Step 2: Fix `PropertyFilterBar.vue`**

Focus the first available property option when the add-filter picker opens. Add Escape handling to close the add picker and edit popover with focus returned to the originating button. Ensure multi-select option chips use `type="button"` and remain reachable in normal Tab order.

- [ ] **Step 3: Fix `PropertyValueEditor.vue`**

For teleported select/multi-select popovers, add `role="listbox"` or `role="menu"` as appropriate, active option state, ArrowUp/ArrowDown/Home/End support, Enter/Space select/toggle, Escape cancel, and focus restoration to the inline trigger after commit/cancel.

- [ ] **Step 4: Fix `PropertySchemaEditor.vue`**

Add drawer focus-on-open and Escape close if not already covered by shared focus helpers. Add keyboard reorder buttons or move-up/move-down actions next to the drag handle so ordering is not pointer-only. Keep the visual drag affordance intact.

- [ ] **Step 5: Verify**

Run:

```bash
npm run test:e2e:a11y -- e2e/accessibility/dashboard-controls.spec.ts
npm run test:unit
```

Expected: property control tests pass and existing unit coverage stays green.

### Task 5: Fix Schedule and Timezone Controls

**Files:**
- Modify: `app/components/InterviewScheduleSidebar.vue`
- Modify: `e2e/accessibility/dashboard-controls.spec.ts`

- [ ] **Step 1: Add schedule keyboard case**

Add a Playwright case that opens the interview scheduler, tabs through required date/time/interviewer fields, opens the timezone dropdown by keyboard, changes timezone with Arrow/Enter, closes with Escape, and confirms focus returns predictably.

- [ ] **Step 2: Apply shared listbox/menu primitive**

Replace the timezone dropdown’s bespoke open/close/key handling with `FactorySelect` or `useListboxNavigation`, whichever preserves the current form shape with less code. Prefer `FactorySelect` if it is functionally equivalent.

- [ ] **Step 3: Verify**

Run:

```bash
npm run test:e2e:a11y -- e2e/accessibility/dashboard-controls.spec.ts
npm run test:e2e:interviews
```

Expected: scheduler keyboard coverage passes without regressing interview lifecycle tests.

### Task 6: CI Integration and Closure Evidence

**Files:**
- Modify: `.github/workflows/*` if needed
- Modify: `docs/reference/ROADMAP.md` only if the keyboard checklist needs a current status note

- [ ] **Step 1: Wire the a11y lane into CI**

If the main Playwright workflow already supports named scripts, add `npm run test:e2e:a11y`. Otherwise add a dedicated job that uses the same CI-safe dummy env and disposable DB contract as the existing E2E lanes.

- [ ] **Step 2: Run local closure checks**

Run:

```bash
npm run test:unit
npm run typecheck
npm run test:e2e:a11y
npm run check:conventions
```

Expected: all pass. If `test:e2e:a11y` is blocked by local services, include the exact blocker and still run `tests/unit/e2e-harness-contract.test.ts` if the harness contract changed.

- [ ] **Step 3: Prepare issue closure notes**

For #47, report: new `test:e2e:a11y` lane, coverage matrix surfaces, DevTools disabled, and CI wiring.

For #53, report: each named control fixed, tests proving keyboard operation, and any intentionally native-control replacement.

---

## Validation Checklist

- `npm run test:e2e:a11y`
- `npm run test:unit`
- `npm run typecheck`
- `npm run check:conventions`
- Browser QA for candidate/jobs dashboard pages, property editor drawer, property value popovers, and interview scheduler

## Risks

- Authenticated E2E setup can fail for environment reasons; reuse the repo’s dummy S3/disposable DB contract rather than weakening tests.
- `PropertyValueEditor.vue` teleports popovers to body, so outside-click and focus restoration must account for content outside the inline root.
- `ConversationItem.vue` menu state is parent-controlled, so the cleanest fix may involve `ChatbotSidebar.vue` even though the broken markup is in the item component.
