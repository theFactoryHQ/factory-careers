/**
 * Require-org middleware — redirects users without an active organization
 * to the org creation page. Must be used after the `auth` middleware.
 */
export default defineNuxtRouteMiddleware(async () => {
  // Use the centralized cached session composable (deduped)
  const { session, status, refresh } = useAuthSession()
  const localePath = useLocalePath()

  // Ensure the session has settled before checking activeOrganizationId.
  if (status.value === 'loading') {
    await refresh()
  }

  if (session.value && !session.value.session.activeOrganizationId) {
    return navigateTo(localePath('/onboarding/create-org'))
  }
})
