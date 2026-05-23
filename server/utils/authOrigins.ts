function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim()
  return first || null
}

function protocolFrom(value: string | null): 'http' | 'https' | null {
  const protocol = firstHeaderValue(value)?.toLowerCase()
  return protocol === 'http' || protocol === 'https' ? protocol : null
}

function requestProtocol(request: Request): 'http' | 'https' {
  const forwardedProtocol = protocolFrom(request.headers.get('x-forwarded-proto'))
  if (forwardedProtocol) return forwardedProtocol

  try {
    const protocol = new URL(request.url).protocol
    return protocol === 'http:' ? 'http' : 'https'
  } catch {
    return 'https'
  }
}

function originFromHost(host: string | null, protocol: 'http' | 'https'): string | null {
  const cleanHost = firstHeaderValue(host)
    ?.replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.trim()

  if (!cleanHost) return null
  return normalizeTrustedOrigin(`${protocol}://${cleanHost}`)
}

function originFromUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null
  } catch {
    return null
  }
}

export function normalizeTrustedOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (trimmed.includes('*') || trimmed.includes('?')) {
    return trimmed.replace(/\/+$/, '')
  }

  const explicitOrigin = originFromUrl(trimmed)
  if (explicitOrigin) return explicitOrigin

  return originFromUrl(`https://${trimmed.replace(/^\/+/, '')}`)
}

export function collectRequestTrustedOrigins(request?: Request): string[] {
  if (!request) return []

  const origins = new Set<string>()
  const protocol = requestProtocol(request)
  const requestOrigin = originFromUrl(request.url)
  const forwardedOrigin = originFromHost(request.headers.get('x-forwarded-host'), protocol)
  const hostOrigin = originFromHost(request.headers.get('host'), protocol)

  for (const origin of [requestOrigin, forwardedOrigin, hostOrigin]) {
    if (origin) origins.add(origin)
  }

  return [...origins]
}

export function uniqueTrustedOrigins(origins: Array<string | null | undefined>): string[] {
  const normalized = origins
    .map((origin) => normalizeTrustedOrigin(origin))
    .filter((origin): origin is string => !!origin)

  return [...new Set(normalized)]
}
