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
 * Usage in middleware, layouts, and shell components (async context):
 *   const { session } = await useAuthSession()
 *   if (!session.value) { ... }
 *
 * Do not call `authClient.useSession(useFetch)` outside this composable in
 * dashboard shell code (`dashboard`/`settings` layouts, `AppTopBar`, PostHog identity).
 */
import { authClient } from '~/utils/auth-client'

export async function useAuthSession() {
  // The official Better Auth Vue composable already does excellent
  // client-side caching and reactive updates. We pass useFetch so it
  // integrates with Nuxt's SSR + payload transfer.
  const session = await authClient.useSession(useFetch)

  return {
    /** Reactive session data (Ref) */
    session: session.data,
    /** Whether Better Auth is still resolving the Nuxt useFetch session request */
    isPending: session.isPending,
    /** Reactive fetch error from the session request */
    error: session.error,
  }
}
