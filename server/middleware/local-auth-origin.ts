export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event)

  if (requestUrl.hostname !== '127.0.0.1') return

  const authBaseUrl = env.BETTER_AUTH_URL?.trim()
  if (!authBaseUrl) return

  let authOrigin: URL
  try {
    authOrigin = new URL(authBaseUrl)
  } catch {
    return
  }

  if (authOrigin.hostname !== 'localhost') return

  const shouldCanonicalize =
    requestUrl.pathname === '/auth/sign-in' ||
    requestUrl.pathname === '/api/auth/factory-sso'

  if (!shouldCanonicalize) return

  const canonicalUrl = new URL(requestUrl)
  canonicalUrl.protocol = authOrigin.protocol
  canonicalUrl.hostname = authOrigin.hostname
  canonicalUrl.port = authOrigin.port

  return sendRedirect(event, canonicalUrl.toString(), 302)
})
