# Airy Dashboard Controls Design

## Goal

Reduce the boxed, grid-like feeling of Factory Careers’ authenticated dashboard by removing routine control outlines while preserving clear hierarchy, state, and keyboard accessibility.

## Scope

The cleanup applies only inside `.factory-dashboard-shell` and `.factory-dashboard-portal`. Public job pages, authentication screens, form fields, menus, tables, structural panels, primary calls to action, and destructive actions keep their existing boundaries.

Routine dashboard controls use three visual layers:

1. Secondary buttons use a quiet neutral fill without an outline.
2. Toolbar actions remain visually open at rest, gain a soft fill on hover, and use a brand tint plus bottom accent when active.
3. Tabs and segmented view controls use typography, tint, and a bottom accent instead of a four-sided border.

The existing dark palette, square geometry, uppercase control typography, dimensions, and spacing remain unchanged. This is a hierarchy cleanup, not a broader rebrand.

## Shared Recipes

`app/assets/css/main.css` remains the single owner. New dashboard-scoped control-fill tokens keep secondary, hover, and selected states consistent. The update covers:

- `.ui-button-secondary`
- `.ui-tab`, `.ui-tab-active`, and tab hover
- `.factory-toolbar-button` and `.factory-back-button`
- `.factory-job-subnav-tab`
- `.factory-candidate-detail-tab`
- `.factory-view-toggle` and its buttons

Inline Tailwind `border` utilities can remain in component markup because the dashboard recipes override them. This avoids a broad markup migration and keeps neutral/public rendering unchanged.

## Accessibility And Interaction

All affected controls retain their current hit areas, labels, disabled behavior, and click handling. A shared `:focus-visible` rule supplies a two-pixel brand outline with offset so removing resting borders never weakens keyboard focus. Active tabs and toggles retain both color and a bottom accent, so selection does not depend on color alone.

## Verification

A unit-level CSS contract test will fail against the current boxed recipes, then pass after the shared CSS update. Focused tests, convention checks, typecheck, and build will guard regressions. Browser QA will inspect representative dashboard toolbar, tab, segmented-toggle, and detail-tab states at desktop and mobile widths, including hover, selection, keyboard focus, wrapping, and console health.
