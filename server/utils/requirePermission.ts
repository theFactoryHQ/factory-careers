import type { H3Event } from 'h3'
import type { statements } from '~~/shared/permissions'
import { authenticateWithActiveOrg } from './authenticateSession'

export type { AuthSessionWithActiveOrg } from './authenticateSession'

/**
 * Permission descriptor — maps a resource to the actions being requested.
 *
 * Example: `{ job: ['create'] }` or `{ candidate: ['read', 'update'] }`
 *
 * The type is derived from the shared `statements` constant so that
 * every resource and action is validated at compile time.
 */
type PermissionRequest = {
  [K in keyof typeof statements]?: ReadonlyArray<(typeof statements)[K][number]>
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * requirePermission — the ONLY way to gate an API route.
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1. Authenticates the user (401 if no session).
 * 2. Verifies an active organization is selected (403 if not).
 * 3. Checks the requested permission(s) against Better Auth's AC system (403 if denied).
 *
 * Returns the full session object so callers can extract `activeOrganizationId`
 * and `user` without additional lookups.
 *
 * **Deny-by-default**: if a permission isn't explicitly granted to the user's
 * role in `shared/permissions.ts`, this function throws 403.
 *
 * Usage:
 * ```ts
 * const session = await requirePermission(event, { job: ['create'] })
 * const orgId = session.session.activeOrganizationId
 * ```
 */
export async function requirePermission(
  event: H3Event,
  permissions: PermissionRequest,
) {
  const session = await authenticateWithActiveOrg(event)

  const requestedActions = Object.values(permissions).reduce(
    (count, actions) => count + (actions?.length ?? 0),
    0,
  )

  if (requestedActions === 0) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: no permissions requested',
    })
  }

  // ── Permission check (Better Auth AC) ──
  // Type assertion needed because the organization plugin dynamically
  // extends auth.api with hasPermission, which TypeScript can't infer
  // through the lazy proxy pattern.
  const result = await (auth.api as any).hasPermission({
    headers: event.headers,
    body: {
      permissions: permissions as Record<string, string[]>,
    },
  })

  if (result.error || result.success !== true) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: insufficient permissions',
    })
  }

  return session
}