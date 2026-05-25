# Theme Contract

Factory Careers uses Factory product shells with reusable neutral UI recipes. Product-specific theme classes are allowed for Factory-owned chrome, but generic UI primitives should stay neutral.

## Allowed Factory-Specific Classes

| Class family | Purpose |
| --- | --- |
| `factory-dashboard-shell`, `factory-dashboard-portal` | Dashboard theme scopes. |
| `factory-dashboard-topbar` | Dashboard navigation chrome. |
| `factory-form-select` | Select affordance where native styling needs a custom chevron. |
| `factory-toolbar-button`, `factory-view-toggle`, `factory-saved-views-*` | Dashboard toolbar and saved-view controls. |
| `factory-pipeline-*`, `factory-job-stage-mini-*` | Pipeline and stage visualizations. |
| `factory-danger-*` | Destructive settings affordances. |

## Neutral Recipes

Use `--ui-*` variables and neutral `ui-*` recipes for generic panels, buttons, fields, alerts, menus, pills, badges, drawers, and modals.

Do not add new `factory-*` classes for reusable surfaces. If a component can appear outside Factory dashboard chrome, it should consume neutral tokens.

