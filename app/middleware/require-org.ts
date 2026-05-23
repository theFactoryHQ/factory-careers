/**
 * Require-org middleware — redirects users without an active organization
 * to the org creation page. Must be used after the `auth` middleware.
 */
export default defineNuxtRouteMiddleware(async () => {
  // Use the centralized cached session composable (deduped)
  const { session } = await useAuthSession()
  const localePath = useLocalePath()

  if (session.value && !session.value.session.activeOrganizationId) {
    return navigateTo(localePath('/onboarding/create-org'))
  }
})
