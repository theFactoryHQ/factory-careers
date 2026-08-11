import { safeOutboundFetch } from './safeOutboundFetch'
import { revealSsoProviderRecord } from './ssoProviderSecrets'
import { validateServerSideUrlShape } from './serverSideUrl'

export type MicrosoftSsoHealthCode =
  | 'healthy'
  | 'invalid_client'
  | 'transient_failure'
  | 'metadata_missing'
  | 'expires_30d'
  | 'expires_14d'
  | 'expires_7d'
  | 'expired'

export type MicrosoftSsoHealthResponse = {
  ok: boolean
  code: MicrosoftSsoHealthCode
  checkedAt: string
}

type SsoProviderHealthInput = {
  oidcConfig: string | null
}

type SsoCredentialMetadataInput = {
  expiresAt: Date
}

interface ProbeMicrosoftSsoCredentialOptions {
  provider: SsoProviderHealthInput | null
  metadata: SsoCredentialMetadataInput | null
  rootSecret: string
  safeFetch?: typeof fetch
  now?: Date
}

const MICROSOFT_GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
const CACHE_TTL_MS = 5 * 60_000

let cachedHealth: { expiresAt: number, value: MicrosoftSsoHealthResponse } | undefined
let pendingHealth: Promise<MicrosoftSsoHealthResponse> | undefined

function result(
  code: MicrosoftSsoHealthCode,
  checkedAt: string,
): MicrosoftSsoHealthResponse {
  return { ok: code === 'healthy', code, checkedAt }
}

function expiryCode(expiresAt: Date, now: Date): MicrosoftSsoHealthCode | undefined {
  const remainingMs = expiresAt.getTime() - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'expired'

  const remainingDays = remainingMs / (24 * 60 * 60_000)
  if (remainingDays <= 7) return 'expires_7d'
  if (remainingDays <= 14) return 'expires_14d'
  if (remainingDays <= 30) return 'expires_30d'
  return undefined
}

function parseProviderConfig(
  provider: SsoProviderHealthInput,
  rootSecret: string,
): { clientId: string, clientSecret: string, tokenEndpoint: string } | undefined {
  try {
    const revealed = revealSsoProviderRecord(provider, rootSecret)
    if (typeof revealed.oidcConfig !== 'string') return undefined
    const config = JSON.parse(revealed.oidcConfig) as Record<string, unknown>
    const { clientId, clientSecret, tokenEndpoint } = config
    if (
      typeof clientId !== 'string' || !clientId.trim()
      || typeof clientSecret !== 'string' || !clientSecret.trim()
      || typeof tokenEndpoint !== 'string' || !tokenEndpoint.trim()
    ) {
      return undefined
    }
    if (!validateServerSideUrlShape(tokenEndpoint).ok) return undefined
    return { clientId, clientSecret, tokenEndpoint }
  }
  catch {
    return undefined
  }
}

export async function probeMicrosoftSsoCredential({
  provider,
  metadata,
  rootSecret,
  safeFetch: fetchImpl = safeOutboundFetch,
  now = new Date(),
}: ProbeMicrosoftSsoCredentialOptions): Promise<MicrosoftSsoHealthResponse> {
  const checkedAt = now.toISOString()
  if (!provider || !metadata) return result('metadata_missing', checkedAt)

  const config = parseProviderConfig(provider, rootSecret)
  if (!config) return result('metadata_missing', checkedAt)

  let response: Response
  try {
    response = await fetchImpl(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
        scope: MICROSOFT_GRAPH_SCOPE,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    })
  }
  catch {
    return result('transient_failure', checkedAt)
  }

  if (response.ok) {
    return result(expiryCode(metadata.expiresAt, now) ?? 'healthy', checkedAt)
  }

  let providerCode: unknown
  try {
    const body = await response.json() as { error?: unknown }
    providerCode = body.error
  }
  catch {
    providerCode = undefined
  }

  if (providerCode === 'invalid_client' || providerCode === 'unauthorized_client') {
    return result('invalid_client', checkedAt)
  }
  return result('transient_failure', checkedAt)
}

export function resetMicrosoftSsoHealthCache(): void {
  cachedHealth = undefined
  pendingHealth = undefined
}

export async function getCachedMicrosoftSsoHealth(
  run: () => Promise<MicrosoftSsoHealthResponse>,
  nowMs = Date.now(),
): Promise<MicrosoftSsoHealthResponse> {
  if (cachedHealth && cachedHealth.expiresAt > nowMs) return cachedHealth.value
  if (pendingHealth) return await pendingHealth

  pendingHealth = run()
  try {
    const value = await pendingHealth
    cachedHealth = { expiresAt: nowMs + CACHE_TTL_MS, value }
    return value
  }
  finally {
    pendingHealth = undefined
  }
}

export function isSuccessfulMicrosoftSsoExchange(code: MicrosoftSsoHealthCode): boolean {
  return code === 'healthy' || code.startsWith('expires_')
}
