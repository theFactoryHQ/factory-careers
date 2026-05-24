export const SIGNUP_ALLOWED_DOMAINS_MAX = 50

export const SIGNUP_DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export const COMMON_CONSUMER_EMAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'ymail.com',
])

export function normalizeSignupDomain(domain: unknown): string | null {
  if (typeof domain !== 'string') return null
  const normalized = domain.trim().toLowerCase().replace(/^@+/, '').replace(/\.$/, '')
  if (normalized.length > 253 || !SIGNUP_DOMAIN_PATTERN.test(normalized)) return null
  return normalized
}

export function normalizeSignupAllowedDomains(domains: unknown): string[] {
  if (!Array.isArray(domains)) return []

  const normalized = domains
    .map(normalizeSignupDomain)
    .filter((domain): domain is string => !!domain)

  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b))
}

export function extractSignupEmailDomain(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  const atIndex = normalized.lastIndexOf('@')
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null
  return normalizeSignupDomain(normalized.slice(atIndex + 1))
}

export function isSignupEmailDomainAllowed(email: unknown, allowedDomains: unknown): boolean {
  const domain = extractSignupEmailDomain(email)
  if (!domain) return false
  return normalizeSignupAllowedDomains(allowedDomains).includes(domain)
}

export function isCommonConsumerEmailDomain(domain: unknown): boolean {
  const normalized = normalizeSignupDomain(domain)
  return !!normalized && COMMON_CONSUMER_EMAIL_DOMAINS.has(normalized)
}
