export function resolveFactoryCareersBaseUrl(): string {
  const explicitUrl = env.BETTER_AUTH_URL?.trim()
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '')

  const platformDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim()
  if (platformDomain) {
    return `https://${platformDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
  }

  return 'https://careers.thefactoryhq.com'
}
