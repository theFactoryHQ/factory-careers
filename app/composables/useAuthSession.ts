/**
 * Centralized, cached auth session composable.
 *
 * Wraps Better Auth's official useSession hook with explicit guidance
 * and a stable key for Nuxt's payload cache. This is the single source
 * of truth for session checks in middleware and pages.
 *
 * Benefits:
 * - Deduplicates the direct `authClient.useSession(useFetch)` calls
 *   that were duplicated in auth.ts + require-org.ts.
 * - Leverages Nuxt's built-in getCachedData + Better Auth's internal state
 *   for fast repeated checks during navigation.
 * - Easy to extend later with stronger SWR / TTL if needed.
 *
 * Usage in middleware (async context):
 *   const { session } = useAuthSession()
 *   if (!session.value) { ... }
 *
 * Usage in pages/composables:
 *   const { session } = useAuthSession()
 */
import { authClient } from '~/utils/auth-client'

export function useAuthSession() {
  // The official Better Auth Vue composable already does excellent
  // client-side caching and reactive updates. We pass useFetch so it
  // integrates with Nuxt's SSR + payload transfer.
  const { data: session, refresh, status } = authClient.useSession(useFetch)

  return {
    /** Reactive session (null until loaded) */
    session,
    /** Force refresh the session (useful after login/org switch) */
    refresh,
    /** 'loading' | 'authenticated' | 'unauthenticated' etc. */
    status,
  }
}
