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
  const stored = await useStorage().getItem<number>(
    `${ORG_DASHBOARD_CACHE_VERSION_PREFIX}${orgId}`,
  )
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : 0
}

/** Bump the org cache generation so new list/stats reads miss prior Nitro entries. */
export async function bumpOrgDashboardCacheVersion(
  orgId: string,
): Promise<void> {
  const current = await getOrgDashboardCacheVersion(orgId)
  await useStorage().setItem(
    `${ORG_DASHBOARD_CACHE_VERSION_PREFIX}${orgId}`,
    current + 1,
  )
}

/** Invalidate org-scoped dashboard list/stats caches for the active session org. */
export async function invalidateOrgScopedDashboardCache(
  event: H3Event,
): Promise<void> {
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) return

  const orgId = await resolveActiveOrganizationId(session)
  if (!orgId) return

  await bumpOrgDashboardCacheVersion(orgId)
}

/** Invalidate org-scoped dashboard caches when only the organization id is known (e.g. public apply). */
export async function invalidateOrgScopedDashboardCacheForOrg(
  orgId: string,
): Promise<void> {
  if (!orgId) return
  await bumpOrgDashboardCacheVersion(orgId)
}

/**
 * Cache org-scoped dashboard data after the caller has authorized the request.
 * Loaders receive only the authorized organization id and normalized route input.
 */
export function defineOrgScopedCachedFunction<Input, Result>(
  name: string,
  loader: (organizationId: string, input: Input) => Result | Promise<Result>,
) {
  return defineCachedFunction(loader, {
    maxAge: ORG_SCOPED_CACHE_MAX_AGE_SECONDS,
    swr: true,
    name: `${ORG_SCOPED_DASHBOARD_CACHE_NAME}-${escapeCacheKeyPart(name)}`,
    getKey: async (organizationId: string, input: Input) => {
      const version = await getOrgDashboardCacheVersion(organizationId)
      return hash({ organizationId, version, input })
    },
  })
}
