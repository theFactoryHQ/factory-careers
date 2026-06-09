import { dashboardWarmRoutePaths } from '~~/shared/dashboard-prefetch'

function scheduleIdleTask(task: () => void) {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(task, { timeout: 2000 })
    return
  }

  setTimeout(task, 0)
}

/**
 * Client-only warm prefetch for common dashboard nav targets.
 * Schedules route chunk preload on idle and invokes list composables once so
 * shared payload keys are populated before the first sidebar tap.
 */
export function useDashboardWarmPrefetch() {
  if (import.meta.server) {
    return
  }

  const router = useRouter()
  const localePath = useLocalePath()
  const route = useRoute()

  onMounted(() => {
    scheduleIdleTask(() => {
      const dashboardHome = localePath('/dashboard')
      const paths = dashboardWarmRoutePaths.map(path => localePath(path))

      if (route.path !== dashboardHome) {
        paths.push(dashboardHome)
      }

      for (const path of paths) {
        void preloadRouteComponents(path, router)
      }
    })
  })
}