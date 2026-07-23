import { z } from 'zod'
import {
  assertSafeServerSideUrl,
  validateServerSideUrlShape,
  type ServerSideUrlValidationResult,
} from './serverSideUrl'
import { createSafeOutboundFetch } from './safeOutboundFetch'

interface SsoUrlValidationOptions {
  allowLocalHttp?: boolean
}

interface SsoDiscoveryDependencies {
  safeFetch?: typeof fetch
}

interface OidcDiscoveryDocument {
  issuer?: unknown
  authorization_endpoint?: unknown
  token_endpoint?: unknown
  userinfo_endpoint?: unknown
  jwks_uri?: unknown
}

export interface OidcRegistrationConfig {
  skipDiscovery: true
  discoveryEndpoint: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userInfoEndpoint?: string
  jwksEndpoint: string
}

const domainSchema = z.string().min(1).max(253).regex(
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
  'Must be a valid domain (e.g. company.com)',
)

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
}

function isLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = normalizeHostname(url.hostname)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function validationOptionsForUrl(value: string, options: SsoUrlValidationOptions = {}) {
  const allowLocalHttp = options.allowLocalHttp === true
    && value.startsWith('http://')
    && isLocalhostUrl(value)

  return {
    allowedProtocols: allowLocalHttp ? ['https:', 'http:'] : ['https:'],
    allowLocalhost: allowLocalHttp,
  } as const
}

export function computeOidcDiscoveryEndpoint(issuer: string): string {
  return `${normalizeIssuer(issuer)}/.well-known/openid-configuration`
}

export function validateSsoIssuerUrlShape(
  value: string,
  options: SsoUrlValidationOptions = {},
): ServerSideUrlValidationResult {
  return validateServerSideUrlShape(value, validationOptionsForUrl(value, options))
}

function requireDiscoveryString(doc: OidcDiscoveryDocument, key: keyof OidcDiscoveryDocument): string {
  const value = doc[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`OIDC discovery document is missing ${key}`)
  }
  return value
}

async function validateDiscoveryEndpoint(name: string, value: string, options: SsoUrlValidationOptions): Promise<string> {
  const result = validateServerSideUrlShape(value, validationOptionsForUrl(value, options))
  if (!result.ok) {
    throw new Error(`OIDC discovery ${name} is not allowed: ${result.reason}`)
  }

  try {
    await assertSafeServerSideUrl(value, validationOptionsForUrl(value, options))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'URL hostname could not be resolved safely'
    throw new Error(`OIDC discovery ${name} is not allowed: ${message}`)
  }

  return result.url!.toString()
}

export async function buildOidcRegistrationConfigFromDiscovery(
  issuer: string,
  doc: OidcDiscoveryDocument,
  options: SsoUrlValidationOptions = {},
): Promise<OidcRegistrationConfig> {
  const discoveredIssuer = requireDiscoveryString(doc, 'issuer')
  if (normalizeIssuer(discoveredIssuer) !== normalizeIssuer(issuer)) {
    throw new Error(`OIDC discovery issuer mismatch: expected ${issuer}, got ${discoveredIssuer}`)
  }

  const discoveryEndpoint = await validateDiscoveryEndpoint(
    'discoveryEndpoint',
    computeOidcDiscoveryEndpoint(issuer),
    options,
  )
  const authorizationEndpoint = await validateDiscoveryEndpoint(
    'authorization_endpoint',
    requireDiscoveryString(doc, 'authorization_endpoint'),
    options,
  )
  const tokenEndpoint = await validateDiscoveryEndpoint(
    'token_endpoint',
    requireDiscoveryString(doc, 'token_endpoint'),
    options,
  )
  const jwksEndpoint = await validateDiscoveryEndpoint(
    'jwks_uri',
    requireDiscoveryString(doc, 'jwks_uri'),
    options,
  )

  const userinfoEndpoint = typeof doc.userinfo_endpoint === 'string' && doc.userinfo_endpoint.trim()
    ? await validateDiscoveryEndpoint('userinfo_endpoint', doc.userinfo_endpoint, options)
    : undefined

  return {
    skipDiscovery: true,
    discoveryEndpoint,
    authorizationEndpoint,
    tokenEndpoint,
    ...(userinfoEndpoint ? { userInfoEndpoint: userinfoEndpoint } : {}),
    jwksEndpoint,
  }
}

export async function discoverOidcRegistrationConfig(
  issuer: string,
  options: SsoUrlValidationOptions = {},
  dependencies: SsoDiscoveryDependencies = {},
): Promise<OidcRegistrationConfig> {
  const issuerResult = validateSsoIssuerUrlShape(issuer, options)
  if (!issuerResult.ok) {
    throw createError({
      statusCode: 422,
      statusMessage: issuerResult.reason ?? 'Issuer URL is not allowed',
    })
  }

  const discoveryEndpoint = computeOidcDiscoveryEndpoint(issuer)
  // Security boundary: this application owns and binds registration-time
  // discovery. Better Auth owns the later token, user-info, and JWKS requests
  // and does not currently expose a supported per-request fetch hook. Do not
  // replace this with a global dispatcher; reassess when the dependency adds
  // fetch injection for its enterprise OIDC callback.
  const safeFetch = dependencies.safeFetch ?? createSafeOutboundFetch(
    {},
    validationOptionsForUrl(discoveryEndpoint, options),
  )
  const response = await safeFetch(discoveryEndpoint, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`OIDC discovery request failed with status ${response.status}`)
  }
  const doc = await response.json() as OidcDiscoveryDocument
  return await buildOidcRegistrationConfigFromDiscovery(issuer, doc, options)
}

export const registerSsoSchema = z.object({
  providerId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Only lowercase alphanumeric and hyphens'),
  issuer: z.string().url()
    .refine(
      url => validateSsoIssuerUrlShape(url, {
        allowLocalHttp: process.env.NODE_ENV !== 'production',
      }).ok,
      'Issuer URL must use HTTPS and must not target local, private, link-local, multicast, or metadata hosts',
    ),
  domain: domainSchema,
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})
