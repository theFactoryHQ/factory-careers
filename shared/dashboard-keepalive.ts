/**
 * Dashboard list pages kept alive on client back-navigation via `definePageMeta`.
 * Nuxt applies KeepAlive at `<NuxtPage>` when route meta `keepalive` is set.
 *
 * v1 scope: list indexes only. Job pipeline/detail routes stay excluded so pipeline
 * data and memory stay fresh. Org switch hard-reload already clears session state.
 */
export const dashboardListPageKeepalive = true

/** Route base names included in the v1 keepalive policy (documentation + tests). */
export const dashboardKeepAliveRouteNames = [
  'dashboard-jobs',
  'dashboard-candidates',
  'dashboard-applications',
  'dashboard-interviews',
  'dashboard-source-tracking',
] as const

/** Cap for future global KeepAlive config if we centralize include/max in app shell. */
export const dashboardKeepAliveMax = 5