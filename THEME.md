# Theme Contract

Factory Careers uses Factory product shells with reusable neutral UI recipes. The visual theme can be Factory-specific; the primitive variables and common recipes should stay product-neutral so dashboard surfaces do not grow one-off Factory-named styling bundles.

## Factory-facing classes

### Product shell selectors

`factory-dashboard-shell` and `factory-dashboard-portal` are the dashboard theme scope classes. Use `factory-dashboard-shell` on routed dashboard layouts and `factory-dashboard-portal` on anything teleported to `body`, such as drawers, modals, and confirmation dialogs.

These selectors activate the Factory dashboard theme by setting neutral variables in `app/assets/css/main.css`: `--ui-bg`, `--ui-panel`, `--ui-panel-strong`, `--ui-border`, `--ui-border-strong`, `--ui-text`, `--ui-muted`, and `--ui-faint`. Do not create `--factory-*` variables for reusable surfaces; add a neutral `--ui-*` token or neutral recipe instead.

### Product-specific adapters

Some `factory-*` classes are allowed because they describe Factory-owned product chrome or domain-specific dashboard controls rather than reusable design primitives.

| Class family | Purpose | Underlying contract |
| --- | --- | --- |
| `factory-dashboard-topbar` | Dashboard navigation chrome | Reads the active shell tokens and should stay scoped to Factory dashboard layouts. |
| `factory-form-select` | Select affordance used where native select styling needs a custom chevron | Uses the neutral field color, border, focus, and disabled tokens. Prefer `ui-field` for ordinary inputs/selects. |
| `factory-toolbar-button`, `factory-view-toggle`, `factory-saved-views-*` | Dashboard toolbar, view toggle, and saved-view controls | Specialized controls backed by shell variables; avoid copying their utility bundles into pages. |
| `factory-pipeline-card`, `factory-pipeline-*`, `factory-job-stage-mini-*` | Pipeline visualizations and job-stage metrics | Domain visualization recipes that should read neutral shell tokens for panels, text, borders, and state. |
| `factory-danger-zone`, `factory-danger-button`, `factory-danger-confirm` | Destructive settings affordances | Product copy and layout are Factory-owned, while colors should map to neutral danger recipes/tokens. |

Do not add new `factory-*` classes for generic panels, buttons, fields, alerts, menus, pills, badges, drawers, or modals. Those belong in neutral `ui-*` recipes.

## Neutral variables

Use neutral variables for reusable surfaces and common chrome:

- `--ui-bg`: page or overlay root background.
- `--ui-panel` and `--ui-panel-strong`: normal and elevated panel fills.
- `--ui-border` and `--ui-border-strong`: normal and emphasized separators.
- `--ui-text`, `--ui-muted`, and `--ui-faint`: primary, secondary, and low-emphasis text/icon colors.

The Factory shell adapts these variables to a dark Factory treatment. Components should consume recipes or variables without needing to know whether they are rendered in a Factory dashboard, settings shell, or portal.

## Recipe families

Reusable surfaces and controls should compose neutral `ui-*` classes:

| Family | Use |
| --- | --- |
| Panels and cards | `ui-panel`, `ui-panel-muted`, `ui-panel-danger`, `ui-dashboard-panel`, `ui-dashboard-panel-header`, `ui-dashboard-stat-card`, `ui-table-shell`, `ui-table-header`, `ui-table-row` |
| Modals, drawers, and portals | `ui-modal-backdrop`, `ui-modal-panel`, `ui-drawer-panel`, `ui-drawer-header`, `ui-drawer-body`, `ui-filter-drawer` |
| Forms and controls | `ui-field`, `ui-field-invalid`, `ui-field-addon`, `ui-field-icon`, `ui-field-icon-button`, `ui-checkbox`, `ui-radio-brand`, `ui-disclosure-trigger` |
| Actions and menus | `ui-button`, `ui-button-primary`, `ui-button-secondary`, `ui-button-ghost`, `ui-button-danger`, `ui-floating-menu`, `ui-menu-trigger`, `ui-menu-action` |
| Status and metadata | `ui-pill`, `ui-pill-brand`, `ui-pill-success`, `ui-pill-warning`, `ui-pill-danger`, `ui-filter-chip`, `ui-filter-chip-active`, `ui-filter-chip-inactive`, `ui-alert`, `ui-alert-danger`, `ui-alert-success` |
| Empty and icon states | `ui-empty-state`, `ui-empty-panel`, `ui-icon-state`, `ui-icon-state-brand`, `ui-icon-state-danger`, `ui-dashboard-soft-icon` |

New components should not duplicate long background, border, radius, focus, or text-color utility bundles. Add or extend a neutral recipe first, then adapt that recipe inside `factory-dashboard-shell` or `factory-dashboard-portal` if the Factory theme needs a different treatment.

## Third-party brand colors

True third-party brand colors can stay explicit when they represent an external provider, logo, or required integration mark. Microsoft sign-in styling is an example of a deliberate exception. Keep those exceptions local and do not use them for Factory-owned surfaces.

## Public job board surfaces (intentional exception)

The public-facing job board and apply flows (`layouts/public.vue`) deliberately force a high-contrast dark theme (`dark min-h-screen bg-black text-white`) with glassmorphic controls (`bg-black/30`, `border-white/10`, `text-white/52`, etc.).

This is **product branding** for the candidate experience on careers.thefactoryhq.com and is intentionally separate from the internal dashboard's neutral `--ui-*` token system and `ui-dashboard-*` recipes.

- Files under `app/pages/jobs/**`, `app/pages/join/**`, and components like `DynamicField.vue` (when used in public apply forms) may continue to use direct dark + white-opacity utilities.
- Do not attempt to force `ui-panel` / `--ui-panel` here; the visual goal is different (marketing dark vs. internal tool dark).
- If repetition becomes painful, a small set of `ui-public-job-*` recipes can be added later, but they would live outside the neutral dashboard token contract.

This exception is documented so the "no raw theme bundles" rule for internal dashboard surfaces remains enforceable.
