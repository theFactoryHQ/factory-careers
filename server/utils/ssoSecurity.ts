import { z } from 'zod'
import {
  assertSafeServerSideUrl,
  validateServerSideUrlShape,
  type ServerSideUrlValidationResult,
} from './serverSideUrl'

interface SsoUrlValidationOptions {
  allowLocalHttp?: boolean
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

function validateDiscoveryEndpoint(name: string, value: string, options: SsoUrlValidationOptions): string {
  const result = validateServerSideUrlShape(value, validationOptionsForUrl(value, options))
  if (!result.ok) {
    throw new Error(`OIDC discovery ${name} is not allowed: ${result.reason}`)
  }
  return result.url!.toString()
}

export function buildOidcRegistrationConfigFromDiscovery(
  issuer: string,
  doc: OidcDiscoveryDocument,
  options: SsoUrlValidationOptions = {},
): OidcRegistrationConfig {
  const discoveredIssuer = requireDiscoveryString(doc, 'issuer')
  if (normalizeIssuer(discoveredIssuer) !== normalizeIssuer(issuer)) {
    throw new Error(`OIDC discovery issuer mismatch: expected ${issuer}, got ${discoveredIssuer}`)
  }

  const discoveryEndpoint = validateDiscoveryEndpoint(
    'discoveryEndpoint',
    computeOidcDiscoveryEndpoint(issuer),
    options,
  )
  const authorizationEndpoint = validateDiscoveryEndpoint(
    'authorization_endpoint',
    requireDiscoveryString(doc, 'authorization_endpoint'),
    options,
  )
  const tokenEndpoint = validateDiscoveryEndpoint(
    'token_endpoint',
    requireDiscoveryString(doc, 'token_endpoint'),
    options,
  )
  const jwksEndpoint = validateDiscoveryEndpoint(
    'jwks_uri',
    requireDiscoveryString(doc, 'jwks_uri'),
    options,
  )

  const userinfoEndpoint = typeof doc.userinfo_endpoint === 'string' && doc.userinfo_endpoint.trim()
    ? validateDiscoveryEndpoint('userinfo_endpoint', doc.userinfo_endpoint, options)
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
): Promise<OidcRegistrationConfig> {
  const issuerResult = validateSsoIssuerUrlShape(issuer, options)
  if (!issuerResult.ok) {
    throw createError({
      statusCode: 422,
      statusMessage: issuerResult.reason ?? 'Issuer URL is not allowed',
    })
  }

  await assertSafeServerSideUrl(issuer, validationOptionsForUrl(issuer, options))

  const discoveryEndpoint = computeOidcDiscoveryEndpoint(issuer)
  await assertSafeServerSideUrl(discoveryEndpoint, validationOptionsForUrl(discoveryEndpoint, options))

  const doc = await $fetch<OidcDiscoveryDocument>(discoveryEndpoint, { timeout: 10_000 })
  return buildOidcRegistrationConfigFromDiscovery(issuer, doc, options)
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
