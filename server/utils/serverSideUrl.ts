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

function parseIpv4Parts(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null

  const values = parts.map((part) => {
    if (!/^\d+$/.test(part)) return null
    const value = Number(part)
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null
  })

  return values.every((value): value is number => value !== null) ? values : null
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = parseIpv4Parts(hostname)
  if (!parts) return true

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

function parseIpv6Groups(hostname: string): number[] | null {
  let normalized = hostname.toLowerCase().split('%')[0] ?? ''
  if (!normalized) return null

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    if (lastColon === -1) return null

    const ipv4Parts = parseIpv4Parts(normalized.slice(lastColon + 1))
    if (!ipv4Parts) return null

    const high = (ipv4Parts[0]! << 8) | ipv4Parts[1]!
    const low = (ipv4Parts[2]! << 8) | ipv4Parts[3]!
    normalized = `${normalized.slice(0, lastColon)}:${high.toString(16)}:${low.toString(16)}`
  }

  const compressedParts = normalized.split('::')
  if (compressedParts.length > 2) return null

  const parsePart = (value: string): number | null => {
    if (!/^[0-9a-f]{1,4}$/i.test(value)) return null
    return Number.parseInt(value, 16)
  }

  const left = compressedParts[0] ? compressedParts[0].split(':') : []
  const right = compressedParts.length === 2 && compressedParts[1]
    ? compressedParts[1].split(':')
    : []

  if (left.some(part => !part) || right.some(part => !part)) return null

  const leftGroups = left.map(parsePart)
  const rightGroups = right.map(parsePart)
  if (leftGroups.some(group => group === null) || rightGroups.some(group => group === null)) return null

  if (compressedParts.length === 1) {
    return leftGroups.length === 8 ? leftGroups as number[] : null
  }

  const zeroFill = 8 - leftGroups.length - rightGroups.length
  if (zeroFill < 1) return null

  return [
    ...(leftGroups as number[]),
    ...Array.from({ length: zeroFill }, () => 0),
    ...(rightGroups as number[]),
  ]
}

function embeddedIpv4FromIpv6(groups: number[]): string | null {
  const firstFiveZero = groups.slice(0, 5).every(group => group === 0)
  const firstSixZero = firstFiveZero && groups[5] === 0
  const isIpv4Mapped = firstFiveZero && groups[5] === 0xffff

  if (!isIpv4Mapped && !firstSixZero) return null

  const high = groups[6]!
  const low = groups[7]!
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff,
  ].join('.')
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  const groups = parseIpv6Groups(normalized)
  if (!groups) return true

  const embeddedIpv4 = embeddedIpv4FromIpv6(groups)
  if (embeddedIpv4 && isBlockedIpv4(embeddedIpv4)) return true

  if (groups.every(group => group === 0)) return true
  if (groups.slice(0, 7).every(group => group === 0) && groups[7] === 1) return true

  const first = groups[0]!
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xff00) === 0xff00) return true

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
