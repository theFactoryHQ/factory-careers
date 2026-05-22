# Theme Contract

Factory Careers uses one product shell with reusable neutral UI recipes.

## Factory-facing classes

`factory-dashboard-shell` and `factory-dashboard-portal` are the only dashboard theme scope classes. Use `factory-dashboard-shell` on routed dashboard layouts and `factory-dashboard-portal` on anything teleported to `body`, such as drawers and modals.

Those classes define the active Factory theme through neutral CSS variables in `app/assets/css/main.css`, including `--ui-bg`, `--ui-panel`, `--ui-panel-strong`, `--ui-border`, `--ui-border-strong`, `--ui-text`, `--ui-muted`, and `--ui-faint`.

## Neutral recipes

Reusable surfaces and controls should compose neutral `ui-*` classes such as `ui-panel`, `ui-field`, `ui-button`, `ui-alert`, `ui-modal-panel`, `ui-drawer-panel`, `ui-menu-trigger`, and `ui-filter-chip`.

New components should not duplicate long background, border, radius, focus, or text-color utility bundles. Add or extend a neutral recipe instead, then adapt it inside the Factory shell if it must change in Factory mode.

## Third-party brand colors

True third-party brand colors can stay explicit when they represent an external provider, logo, or required integration mark. Keep those exceptions local and do not use them for Factory-owned surfaces.
