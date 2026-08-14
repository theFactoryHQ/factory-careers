interface PublicLocale {
  code: string
}

type PublicJobRouteRule = { swr: number } | { cache: false }

export function buildPublicJobRouteRules(
  locales: PublicLocale[],
  defaultLocale: string,
): Record<string, PublicJobRouteRule> {
  const rules: Record<string, PublicJobRouteRule> = {}
  for (const locale of locales) {
    const prefix = locale.code === defaultLocale ? '' : `/${locale.code}`
    const jobs = `${prefix}/jobs`
    rules[jobs] = { swr: 60 }
    rules[`${jobs}/**`] = { swr: 60 }
    rules[`${jobs}/**/apply`] = { cache: false }
    rules[`${jobs}/**/confirmation`] = { cache: false }
  }
  return rules
}
