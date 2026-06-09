import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('dashboard link prefetch policy', () => {
  it('enables interaction and visibility prefetch for NuxtLink defaults', () => {
    const source = readProjectFile('shared/dashboard-prefetch.ts')
    expect(source).toContain('interaction: true')
    expect(source).toContain('visibility: true')
    expect(source).toContain('dashboardLinkPrefetchOn')
  })

  it('wires shared prefetch defaults through nuxt.config experimental.defaults.nuxtLink', () => {
    const nuxtConfig = readProjectFile('nuxt.config.ts')
    expect(nuxtConfig).toContain('dashboardLinkPrefetchOn')
    expect(nuxtConfig).toContain('experimental:')
    expect(nuxtConfig).toContain('prefetchOn: dashboardLinkPrefetchOn')
  })

  it('documents router.options prefetch ownership without stale hover-only settings', () => {
    const routerOptions = readProjectFile('app/router.options.ts')
    expect(routerOptions).toContain('shared/dashboard-prefetch.ts')
    expect(routerOptions).not.toContain("linkPrefetch: 'hover'")
    expect(routerOptions).not.toContain('prefetchComponents: true')
  })
})

describe('dashboard warm prefetch wiring', () => {
  it('lists primary dashboard routes to warm', () => {
    const source = readProjectFile('shared/dashboard-prefetch.ts')
    expect(source).toContain("'/dashboard/jobs'")
    expect(source).toContain("'/dashboard/candidates'")
    expect(source).toContain("'/dashboard/applications'")
  })

  it('schedules idle route preload from the dashboard layout while AppTopBar warms jobs data', () => {
    const layout = readProjectFile('app/layouts/dashboard.vue')
    expect(layout).toContain('useDashboardWarmPrefetch()')

    const composable = readProjectFile('app/composables/useDashboardWarmPrefetch.ts')
    expect(composable).toContain('preloadRouteComponents')
    expect(composable).toContain('requestIdleCallback')
    expect(composable).not.toContain('useSidebarJobs()')
    expect(layout).toContain('AppTopBar')
  })

  it('refreshes the shared jobs list cache after publishing from the new job wizard', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/new.vue')
    expect(source).toContain('patchJobsListCaches(published)')
    expect(source).toContain('refreshJobsListCaches()')
  })
})