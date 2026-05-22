/**
 * Auth middleware — redirects unauthenticated users to sign-in.
 * Apply to any page that requires a logged-in user.
 */
export default defineNuxtRouteMiddleware(async () => {
  // Use the centralized cached session composable (deduped from previous direct calls)
  const { session } = useAuthSession()
  const localePath = useLocalePath()

  if (!session.value) {
    return navigateTo(localePath('/auth/sign-in'))
  }
})
