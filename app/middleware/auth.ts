/**
 * Auth middleware — redirects unauthenticated users to sign-in.
 * Apply to any page that requires a logged-in user.
 */
export default defineNuxtRouteMiddleware(async () => {
  // Use the centralized cached session composable (deduped from previous direct calls)
  const { session, status, refresh } = useAuthSession()
  const localePath = useLocalePath()

  // Ensure the session has settled before making the redirect decision.
  // This addresses race conditions where the fetch is still in flight.
  if (status.value === 'loading') {
    await refresh()
  }

  if (!session.value) {
    return navigateTo(localePath('/auth/sign-in'))
  }
})
