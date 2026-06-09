import type { H3Event } from 'h3'
import { hash } from 'ohash'
import { resolveActiveOrganizationId } from './activeOrganization'

/** Default TTL (seconds) for org-scoped dashboard list/stats Nitro SWR caches. */
export const ORG_SCOPED_CACHE_MAX_AGE_SECONDS = 30

export const ORG_SCOPED_DASHBOARD_CACHE_NAME = 'org-dashboard'

const ORG_DASHBOARD_CACHE_VERSION_PREFIX = 'org-dashboard-cache-version:'

function escapeCacheKeyPart(value: string): string {
  return String(value).replace(/\W/g, '')
}

async function getOrgDashboardCacheVersion(orgId: string): Promise<number> {
  const stored = await useStorage().getItem<number>(`${ORG_DASHBOARD_CACHE_VERSION_PREFIX}${orgId}`)
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : 0
}

/** Bump the org cache generation so new list/stats reads miss prior Nitro entries. */
export async function bumpOrgDashboardCacheVersion(orgId: string): Promise<void> {
  const current = await getOrgDashboardCacheVersion(orgId)
  await useStorage().setItem(`${ORG_DASHBOARD_CACHE_VERSION_PREFIX}${orgId}`, current + 1)
}

/** Invalidate org-scoped dashboard list/stats caches for the active session org. */
export async function invalidateOrgScopedDashboardCache(event: H3Event): Promise<void> {
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) return

  const orgId = await resolveActiveOrganizationId(session)
  if (!orgId) return

  await bumpOrgDashboardCacheVersion(orgId)
}

/** Invalidate org-scoped dashboard caches when only the organization id is known (e.g. public apply). */
export async function invalidateOrgScopedDashboardCacheForOrg(orgId: string): Promise<void> {
  if (!orgId) return
  await bumpOrgDashboardCacheVersion(orgId)
}

/**
 * Nitro `defineCachedEventHandler` defaults for authenticated, org-scoped read APIs.
 * Cache keys include the active organization and a generation counter bumped on writes.
 */
export const orgScopedCacheOptions = {
  maxAge: ORG_SCOPED_CACHE_MAX_AGE_SECONDS,
  swr: true,
  varies: ['cookie', 'authorization'] as const,
  name: ORG_SCOPED_DASHBOARD_CACHE_NAME,
  async getKey(event: H3Event) {
    const session = await auth.api.getSession({ headers: event.headers })
    const orgId = session ? await resolveActiveOrganizationId(session) : null
    const orgPart = escapeCacheKeyPart(orgId ?? 'none')
    const version = orgId ? await getOrgDashboardCacheVersion(orgId) : 0
    const path = event.node.req.originalUrl || event.node.req.url || event.path
    return `${orgPart}:v${version}:${hash(path)}`
  },
}