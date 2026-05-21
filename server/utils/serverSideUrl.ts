import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
])

export interface ServerSideUrlValidationOptions {
  allowedProtocols?: readonly string[]
  allowCredentials?: boolean
  allowLocalhost?: boolean
  requireDnsResolution?: boolean
}

export interface ServerSideUrlValidationResult {
  ok: boolean
  reason?: string
  url?: URL
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }

  const [a, b] = parts

  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true

  return false
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('ff')) return true

  return false
}

export function isBlockedServerSideHostname(hostname: string, options: ServerSideUrlValidationOptions = {}): boolean {
  const normalized = normalizeHostname(hostname)

  if (!normalized) return true

  if (options.allowLocalhost && (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1')) {
    return false
  }

  if (BLOCKED_HOSTNAMES.has(normalized)) return true

  const ipVersion = isIP(normalized)
  if (ipVersion === 4) return isBlockedIpv4(normalized)
  if (ipVersion === 6) return isBlockedIpv6(normalized)

  return false
}

export function validateServerSideUrlShape(
  value: string,
  options: ServerSideUrlValidationOptions = {},
): ServerSideUrlValidationResult {
  const allowedProtocols = options.allowedProtocols ?? ['https:']

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, reason: 'URL must be valid' }
  }

  if (!allowedProtocols.includes(url.protocol)) {
    return { ok: false, reason: `URL must use ${allowedProtocols.join(' or ')}` }
  }

  if (!options.allowCredentials && (url.username || url.password)) {
    return { ok: false, reason: 'URL must not include credentials' }
  }

  if (isBlockedServerSideHostname(url.hostname, options)) {
    return { ok: false, reason: 'URL must not target local, private, link-local, multicast, or metadata hosts' }
  }

  return { ok: true, url }
}

export async function assertSafeServerSideUrl(
  value: string,
  options: ServerSideUrlValidationOptions = {},
): Promise<void> {
  const shape = validateServerSideUrlShape(value, options)
  if (!shape.ok || !shape.url) {
    throw createError({ statusCode: 422, statusMessage: shape.reason ?? 'URL is not allowed' })
  }

  const hostname = normalizeHostname(shape.url.hostname)
  if (isIP(hostname)) return

  let addresses: Awaited<ReturnType<typeof lookup>>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch (err) {
    if (options.requireDnsResolution === false) return
    throw createError({
      statusCode: 422,
      statusMessage: 'URL hostname could not be resolved safely',
      cause: err,
    })
  }

  for (const address of addresses) {
    if (isBlockedServerSideHostname(address.address, options)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'URL hostname resolves to a local, private, link-local, multicast, or metadata address',
      })
    }
  }
}
