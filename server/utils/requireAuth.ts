import type { H3Event } from 'h3'
import { authenticateWithActiveOrg } from './authenticateSession'

export type { AuthSessionWithActiveOrg } from './authenticateSession'

/**
 * Require an authenticated session with an active organization.
 * Throws 401 if not authenticated, 403 if no active organization selected.
 *
 * Usage: `const session = await requireAuth(event)`
 * Then: `const orgId = session.session.activeOrganizationId!`
 */
export async function requireAuth(event: H3Event) {
  return authenticateWithActiveOrg(event)
}