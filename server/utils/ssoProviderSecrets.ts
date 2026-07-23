import type {
  BetterAuthOptions,
  DBAdapter,
  DBAdapterInstance,
  DBTransactionAdapter,
} from 'better-auth'
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import type { Sql } from 'postgres'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_INFO = 'factory-careers:sso-provider-client-secret:v1'
const CIPHERTEXT_NAMESPACE = 'fc-sso:'
const ENCRYPTION_MARKER_FIELD = '_factoryCareersClientSecretEncryption'
const ENCRYPTION_MARKER_VALUE = 'v1'
const SSO_SECRET_BACKFILL_LOCK_ID = 1_731_940_211
const DEFAULT_BACKFILL_BATCH_SIZE = 100

export const SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX = `${CIPHERTEXT_NAMESPACE}v1:`

export class SsoProviderSecretError extends Error {
  constructor() {
    super('SSO provider client secret could not be processed')
    this.name = 'SsoProviderSecretError'
  }
}

function deriveSsoProviderKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', KEY_INFO, 32))
}

export function isEncryptedSsoProviderClientSecret(value: string): boolean {
  return value.startsWith(SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX)
}

export function encryptSsoProviderClientSecret(
  plaintext: string,
  secret: string,
): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, deriveSsoProviderKey(secret), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
  return `${SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX}${payload.toString('base64')}`
}

export function decryptSsoProviderClientSecret(
  encrypted: string,
  secret: string,
): string {
  if (!isEncryptedSsoProviderClientSecret(encrypted)) {
    throw new SsoProviderSecretError()
  }

  try {
    const payload = Buffer.from(
      encrypted.slice(SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX.length),
      'base64',
    )
    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new SsoProviderSecretError()
    }

    const iv = payload.subarray(0, IV_LENGTH)
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(
      ALGORITHM,
      deriveSsoProviderKey(secret),
      iv,
    )
    decipher.setAuthTag(authTag)
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8')
  }
  catch (error) {
    if (error instanceof SsoProviderSecretError) throw error
    throw new SsoProviderSecretError()
  }
}

function parseOidcConfig(oidcConfig: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(oidcConfig) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SsoProviderSecretError()
    }
    return parsed as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof SsoProviderSecretError) throw error
    throw new SsoProviderSecretError()
  }
}

function transformOidcConfig(
  oidcConfig: unknown,
  secret: string,
  direction: 'protect' | 'reveal',
): unknown {
  if (oidcConfig === null || oidcConfig === undefined) return oidcConfig
  if (typeof oidcConfig !== 'string') throw new SsoProviderSecretError()
  const parsed = parseOidcConfig(oidcConfig)
  const encryptionMarker = parsed[ENCRYPTION_MARKER_FIELD]

  if (parsed.clientSecret === undefined) {
    if (encryptionMarker !== undefined) throw new SsoProviderSecretError()
    return oidcConfig
  }
  if (typeof parsed.clientSecret !== 'string') {
    throw new SsoProviderSecretError()
  }

  const currentSecret = parsed.clientSecret
  if (direction === 'protect') {
    if (encryptionMarker !== undefined) {
      if (encryptionMarker !== ENCRYPTION_MARKER_VALUE) {
        throw new SsoProviderSecretError()
      }
      decryptSsoProviderClientSecret(currentSecret, secret)
      return oidcConfig
    }
    return JSON.stringify({
      ...parsed,
      clientSecret: encryptSsoProviderClientSecret(currentSecret, secret),
      [ENCRYPTION_MARKER_FIELD]: ENCRYPTION_MARKER_VALUE,
    })
  }

  if (encryptionMarker === undefined) {
    return oidcConfig
  }
  if (encryptionMarker !== ENCRYPTION_MARKER_VALUE) {
    throw new SsoProviderSecretError()
  }
  const revealedConfig: Record<string, unknown> = {
    ...parsed,
    clientSecret: decryptSsoProviderClientSecret(currentSecret, secret),
  }
  delete revealedConfig[ENCRYPTION_MARKER_FIELD]
  return JSON.stringify(revealedConfig)
}

export function protectSsoProviderRecord<T>(
  record: T,
  secret: string,
): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  const value = record as Record<string, unknown>
  if (!Object.hasOwn(value, 'oidcConfig')) return record
  return {
    ...value,
    oidcConfig: transformOidcConfig(value.oidcConfig, secret, 'protect'),
  } as T
}

export function revealSsoProviderRecord<T>(
  record: T,
  secret: string,
): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  const value = record as Record<string, unknown>
  if (!Object.hasOwn(value, 'oidcConfig')) return record
  return {
    ...value,
    oidcConfig: transformOidcConfig(value.oidcConfig, secret, 'reveal'),
  } as T
}

function redactSsoProviderRecord<T>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  const value = record as Record<string, unknown>
  if (!Object.hasOwn(value, 'oidcConfig') || value.oidcConfig == null) return record
  if (typeof value.oidcConfig !== 'string') throw new SsoProviderSecretError()

  const parsed = parseOidcConfig(value.oidcConfig)
  if (!Object.hasOwn(parsed, 'clientSecret')) return record
  const redactedConfig = { ...parsed }
  delete redactedConfig.clientSecret
  delete redactedConfig[ENCRYPTION_MARKER_FIELD]
  return {
    ...value,
    oidcConfig: JSON.stringify(redactedConfig),
  } as T
}

export type SsoProviderSecretBackfillResult = {
  scanned: number
  encrypted: number
  alreadyEncrypted: number
  withoutClientSecret: number
}

type StoredSsoProviderConfig = {
  id: string
  oidcConfig: string
}

/**
 * Encrypt legacy plaintext SSO client secrets while a PostgreSQL advisory lock
 * serializes rollout across application instances. The ordered, bounded scan
 * keeps memory use constant and makes retries safe after partial completion.
 *
 * The supplied postgres-js client must use a single connection (`max: 1`) so
 * the session-level lock and unlock execute on the same PostgreSQL session.
 */
export async function backfillSsoProviderClientSecrets(
  sql: Sql,
  secret: string,
  options: { batchSize?: number } = {},
): Promise<SsoProviderSecretBackfillResult> {
  const batchSize = options.batchSize ?? DEFAULT_BACKFILL_BATCH_SIZE
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error('SSO provider secret backfill batch size must be between 1 and 1000')
  }

  const result: SsoProviderSecretBackfillResult = {
    scanned: 0,
    encrypted: 0,
    alreadyEncrypted: 0,
    withoutClientSecret: 0,
  }
  let locked = false

  try {
    await sql`select pg_advisory_lock(${SSO_SECRET_BACKFILL_LOCK_ID})`
    locked = true
    let afterId: string | undefined

    while (true) {
      const rows = afterId
        ? await sql<StoredSsoProviderConfig[]>`
            select "id", "oidc_config" as "oidcConfig"
            from "sso_provider"
            where "oidc_config" is not null and "id" > ${afterId}
            order by "id" asc
            limit ${batchSize}
          `
        : await sql<StoredSsoProviderConfig[]>`
            select "id", "oidc_config" as "oidcConfig"
            from "sso_provider"
            where "oidc_config" is not null
            order by "id" asc
            limit ${batchSize}
          `

      if (rows.length === 0) break

      for (const row of rows) {
        result.scanned += 1
        const parsed = parseOidcConfig(row.oidcConfig)
        const clientSecret = parsed.clientSecret
        const encryptionMarker = parsed[ENCRYPTION_MARKER_FIELD]

        if (clientSecret === undefined) {
          if (encryptionMarker !== undefined) {
            throw new SsoProviderSecretError()
          }
          result.withoutClientSecret += 1
          continue
        }
        if (typeof clientSecret !== 'string') {
          throw new SsoProviderSecretError()
        }

        if (encryptionMarker !== undefined) {
          if (encryptionMarker !== ENCRYPTION_MARKER_VALUE) {
            throw new SsoProviderSecretError()
          }
          decryptSsoProviderClientSecret(clientSecret, secret)
          result.alreadyEncrypted += 1
          continue
        }

        const protectedConfig = JSON.stringify({
          ...parsed,
          clientSecret: encryptSsoProviderClientSecret(clientSecret, secret),
          [ENCRYPTION_MARKER_FIELD]: ENCRYPTION_MARKER_VALUE,
        })
        const updated = await sql<{ id: string }[]>`
          update "sso_provider"
          set "oidc_config" = ${protectedConfig}
          where "id" = ${row.id} and "oidc_config" = ${row.oidcConfig}
          returning "id"
        `
        if (updated.length !== 1) {
          throw new SsoProviderSecretError()
        }
        result.encrypted += 1
      }

      afterId = rows.at(-1)!.id
      if (rows.length < batchSize) break
    }

    return result
  }
  finally {
    if (locked) {
      await sql`select pg_advisory_unlock(${SSO_SECRET_BACKFILL_LOCK_ID})`
    }
  }
}

function protectWrite<T extends Record<string, unknown>>(
  model: string,
  value: T,
  secret: string,
): T {
  return model === 'ssoProvider'
    ? protectSsoProviderRecord(value, secret)
    : value
}

function revealResult<T>(model: string, value: T, secret: string): T {
  if (model !== 'ssoProvider' || value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => revealSsoProviderRecord(item, secret)) as T
  }
  return revealSsoProviderRecord(value, secret)
}

function wrapTransactionAdapter(
  adapter: DBTransactionAdapter,
  secret: string,
): DBTransactionAdapter {
  return {
    ...adapter,
    async create(input) {
      const result = await adapter.create({
        ...input,
        data: protectWrite(input.model, input.data, secret),
      })
      return (
        input.model === 'ssoProvider'
          ? redactSsoProviderRecord(result)
          : result
      ) as never
    },
    async findOne(input) {
      return revealResult(
        input.model,
        await adapter.findOne(input),
        secret,
      )
    },
    async findMany(input) {
      return revealResult(
        input.model,
        await adapter.findMany(input),
        secret,
      )
    },
    async update(input) {
      return revealResult(
        input.model,
        await adapter.update({
          ...input,
          update: protectWrite(input.model, input.update, secret),
        }),
        secret,
      )
    },
    async updateMany(input) {
      return adapter.updateMany({
        ...input,
        update: protectWrite(input.model, input.update, secret),
      })
    },
    async consumeOne(input) {
      return revealResult(
        input.model,
        await adapter.consumeOne(input),
        secret,
      )
    },
    async incrementOne(input) {
      const set = input.set
        ? protectWrite(input.model, input.set, secret)
        : input.set
      return revealResult(
        input.model,
        await adapter.incrementOne({ ...input, set }),
        secret,
      )
    },
  }
}

function wrapAdapter(adapter: DBAdapter, secret: string): DBAdapter {
  const transactionAdapter = wrapTransactionAdapter(adapter, secret)
  return {
    ...transactionAdapter,
    async transaction(callback) {
      return adapter.transaction(transaction =>
        callback(wrapTransactionAdapter(transaction, secret)))
    },
  }
}

/**
 * Wrap Better Auth's adapter factory so only the SSO plugin's oidcConfig
 * clientSecret crosses an encrypted storage boundary. Better Auth continues to
 * receive its documented plaintext JSON shape in memory.
 */
export function wrapSsoProviderSecretAdapter(
  adapterFactory: DBAdapterInstance,
  secret: string,
): DBAdapterInstance {
  return (options: BetterAuthOptions) =>
    wrapAdapter(adapterFactory(options), secret)
}
