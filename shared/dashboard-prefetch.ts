/**
 * Global NuxtLink prefetch defaults (wired via `nuxt.config` experimental.defaults.nuxtLink).
 * Tuned for dashboard UX: `interaction` warms route chunks on tap/click (mobile) and
 * pointer/focus (desktop); `visibility` keeps viewport-based prefetch for in-view links.
 */
export const dashboardLinkPrefetchOn = {
  visibility: true,
  interaction: true,
} as const

/** Primary dashboard list routes warmed after first paint in the dashboard layout. */
export const dashboardWarmRoutePaths = [
  '/dashboard/jobs',
  '/dashboard/candidates',
  '/dashboard/applications',
] as const