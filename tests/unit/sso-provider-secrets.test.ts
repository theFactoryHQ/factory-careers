import type {
  BetterAuthOptions,
  DBAdapter,
  DBAdapterInstance,
  DBTransactionAdapter,
} from 'better-auth'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX,
  SsoProviderSecretError,
  decryptSsoProviderClientSecret,
  encryptSsoProviderClientSecret,
  isEncryptedSsoProviderClientSecret,
  protectSsoProviderRecord,
  wrapSsoProviderSecretAdapter,
} from '../../server/utils/ssoProviderSecrets'

const ROOT_SECRET = 'factory-careers-test-auth-secret'.repeat(2)
const OTHER_ROOT_SECRET = 'different-factory-careers-secret'.repeat(2)
const CLIENT_SECRET = 'oidc-client-secret-value'

type ProviderRecord = {
  id: string
  providerId: string
  oidcConfig: string | null
}

function providerRecord(clientSecret = CLIENT_SECRET): ProviderRecord {
  return {
    id: 'provider-record-id',
    providerId: 'provider-id',
    oidcConfig: JSON.stringify({
      clientId: 'client-id',
      clientSecret,
      tokenEndpoint: 'https://idp.example.com/token',
    }),
  }
}

function readClientSecret(record: { oidcConfig?: unknown }): string | undefined {
  if (typeof record.oidcConfig !== 'string') return undefined
  return (JSON.parse(record.oidcConfig) as { clientSecret?: string }).clientSecret
}

function createAdapter(overrides: Partial<DBAdapter> = {}): DBAdapter {
  const transactionAdapter = {
    id: 'transaction-adapter',
    create: vi.fn(async ({ data }) => data),
    findOne: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    update: vi.fn(async () => null),
    updateMany: vi.fn(async () => 0),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => 0),
    consumeOne: vi.fn(async () => null),
    incrementOne: vi.fn(async () => null),
  } satisfies DBTransactionAdapter

  return {
    ...transactionAdapter,
    transaction: vi.fn(async callback => callback(transactionAdapter)),
    ...overrides,
  } as DBAdapter
}

function wrappedAdapter(adapter: DBAdapter): DBAdapter {
  const factory = (() => adapter) as DBAdapterInstance
  return wrapSsoProviderSecretAdapter(factory, ROOT_SECRET)({} as BetterAuthOptions)
}

describe('SSO provider client-secret encryption', () => {
  it('uses randomized, versioned, domain-separated authenticated ciphertext', () => {
    const first = encryptSsoProviderClientSecret(CLIENT_SECRET, ROOT_SECRET)
    const second = encryptSsoProviderClientSecret(CLIENT_SECRET, ROOT_SECRET)

    expect(first).toMatch(/^fc-sso:v1:/)
    expect(second).toMatch(/^fc-sso:v1:/)
    expect(first).not.toBe(second)
    expect(first).not.toContain(CLIENT_SECRET)
    expect(decryptSsoProviderClientSecret(first, ROOT_SECRET)).toBe(CLIENT_SECRET)
    expect(decryptSsoProviderClientSecret(second, ROOT_SECRET)).toBe(CLIENT_SECRET)
    expect(isEncryptedSsoProviderClientSecret(first)).toBe(true)
    expect(isEncryptedSsoProviderClientSecret(CLIENT_SECRET)).toBe(false)
  })

  it('fails closed for wrong keys, tampering, and unsupported versions without exposing values', () => {
    const ciphertext = encryptSsoProviderClientSecret(CLIENT_SECRET, ROOT_SECRET)
    const cases = [
      () => decryptSsoProviderClientSecret(ciphertext, OTHER_ROOT_SECRET),
      () => decryptSsoProviderClientSecret(`${ciphertext.slice(0, -3)}bad`, ROOT_SECRET),
      () => decryptSsoProviderClientSecret(
        ciphertext.replace(SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX, 'fc-sso:v2:'),
        ROOT_SECRET,
      ),
    ]

    for (const run of cases) {
      expect(run).toThrowError(SsoProviderSecretError)
      try {
        run()
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        expect(message).not.toContain(CLIENT_SECRET)
        expect(message).not.toContain(ciphertext)
      }
    }
  })

  it('does not mistake a legacy plaintext secret that resembles the ciphertext prefix', async () => {
    const prefixLikePlaintext = 'fc-sso:v1:legacy-provider-plaintext'
    const protectedRecord = protectSsoProviderRecord(
      providerRecord(prefixLikePlaintext),
      ROOT_SECRET,
    )

    expect(readClientSecret(protectedRecord)).not.toBe(prefixLikePlaintext)
    expect(readClientSecret(protectedRecord)).toMatch(/^fc-sso:v1:/)

    const adapter = wrappedAdapter(createAdapter({
      findOne: vi.fn(async () => protectedRecord as never),
    }))
    const found = await adapter.findOne<ProviderRecord>({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
    })
    expect(readClientSecret(found!)).toBe(prefixLikePlaintext)
  })
})

describe('Better Auth SSO adapter storage boundary', () => {
  it('wires the encrypted adapter and runtime backfill into auth startup', () => {
    const authSource = readFileSync(
      resolve(process.cwd(), 'server/utils/auth.ts'),
      'utf8',
    )
    const migrationSource = readFileSync(
      resolve(process.cwd(), 'server/plugins/migrations.ts'),
      'utf8',
    )

    expect(authSource).toContain('wrapSsoProviderSecretAdapter(')
    expect(authSource).toContain('env.BETTER_AUTH_SECRET')
    expect(migrationSource).toContain('backfillSsoProviderClientSecrets(')
    expect(migrationSource).toContain('sso_provider_secrets.backfill_completed')
  })

  it('encrypts create writes and redacts the returned provider response', async () => {
    let storedData: Record<string, unknown> | undefined
    const adapter = wrappedAdapter(createAdapter({
      create: vi.fn(async ({ data }) => {
        storedData = data as Record<string, unknown>
        return { id: 'provider-record-id', ...data } as never
      }),
    }))

    const created = await adapter.create<ProviderRecord>({
      model: 'ssoProvider',
      data: providerRecord(),
    })

    expect(storedData).toBeDefined()
    expect(JSON.stringify(storedData)).not.toContain(CLIENT_SECRET)
    expect(readClientSecret(storedData!)).toMatch(/^fc-sso:v1:/)
    expect(readClientSecret(created)).toBeUndefined()
    expect(JSON.stringify(created)).not.toContain(CLIENT_SECRET)
    expect(JSON.stringify(created)).not.toContain('fc-sso:v1:')
  })

  it('encrypts update and updateMany writes and decrypts update results', async () => {
    const writes: Array<Record<string, unknown>> = []
    const underlying = createAdapter({
      update: vi.fn(async ({ update }) => {
        writes.push(update)
        return { ...providerRecord(), ...update } as never
      }),
      updateMany: vi.fn(async ({ update }) => {
        writes.push(update)
        return 1
      }),
    })
    const adapter = wrappedAdapter(underlying)

    const updated = await adapter.update<ProviderRecord>({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
      update: { oidcConfig: providerRecord().oidcConfig },
    })
    const updateManyCount = await adapter.updateMany({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
      update: { oidcConfig: providerRecord('rotated-secret').oidcConfig },
    })

    expect(updateManyCount).toBe(1)
    expect(readClientSecret(updated!)).toBe(CLIENT_SECRET)
    expect(JSON.stringify(writes)).not.toContain(CLIENT_SECRET)
    expect(JSON.stringify(writes)).not.toContain('rotated-secret')
    expect(writes.map(readClientSecret)).toEqual([
      expect.stringMatching(/^fc-sso:v1:/),
      expect.stringMatching(/^fc-sso:v1:/),
    ])
  })

  it('decrypts every provider-returning read path used by Better Auth', async () => {
    const encryptedProvider = protectSsoProviderRecord(
      providerRecord(),
      ROOT_SECRET,
    )
    const adapter = wrappedAdapter(createAdapter({
      findOne: vi.fn(async () => encryptedProvider as never),
      findMany: vi.fn(async () => [encryptedProvider] as never),
      consumeOne: vi.fn(async () => encryptedProvider as never),
      incrementOne: vi.fn(async () => encryptedProvider as never),
    }))

    const found = await adapter.findOne<ProviderRecord>({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
    })
    const many = await adapter.findMany<ProviderRecord>({ model: 'ssoProvider' })
    const consumed = await adapter.consumeOne<ProviderRecord>({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
    })
    const incremented = await adapter.incrementOne<ProviderRecord>({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
      increment: { revision: 1 },
    })

    expect([
      readClientSecret(found!),
      readClientSecret(many[0]!),
      readClientSecret(consumed!),
      readClientSecret(incremented!),
    ]).toEqual(Array(4).fill(CLIENT_SECRET))
  })

  it('preserves non-SSO models and provider rows without OIDC secrets exactly', async () => {
    const user = { id: 'user-id', email: 'person@example.com' }
    const providerWithoutSecret = {
      ...providerRecord(),
      oidcConfig: JSON.stringify({ clientId: 'public-client', pkce: true }),
    }
    const writes: unknown[] = []
    const adapter = wrappedAdapter(createAdapter({
      create: vi.fn(async ({ data }) => {
        writes.push(data)
        return data as never
      }),
      findOne: vi.fn(async ({ model }) =>
        (model === 'ssoProvider' ? providerWithoutSecret : user) as never),
    }))

    const createdUser = await adapter.create({
      model: 'user',
      data: user,
    })
    const foundUser = await adapter.findOne({
      model: 'user',
      where: [{ field: 'id', value: user.id }],
    })
    const foundProvider = await adapter.findOne({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
    })

    expect(createdUser).toEqual(user)
    expect(foundUser).toEqual(user)
    expect(foundProvider).toEqual(providerWithoutSecret)
    expect(writes).toEqual([user])
  })

  it('keeps a pre-backfill plaintext provider usable without rewriting it on read', async () => {
    const plaintextProvider = providerRecord()
    const adapter = wrappedAdapter(createAdapter({
      findOne: vi.fn(async () => plaintextProvider as never),
    }))

    const found = await adapter.findOne<ProviderRecord>({
      model: 'ssoProvider',
      where: [{ field: 'providerId', value: 'provider-id' }],
    })

    expect(found).toEqual(plaintextProvider)
    expect(readClientSecret(found!)).toBe(CLIENT_SECRET)
  })

  it('fails closed on malformed config or corrupted encrypted secrets', async () => {
    const protectedProvider = protectSsoProviderRecord(
      providerRecord(),
      ROOT_SECRET,
    )
    const protectedConfig = JSON.parse(protectedProvider.oidcConfig!) as Record<
      string,
      unknown
    >
    const corruptProvider = {
      ...protectedProvider,
      oidcConfig: JSON.stringify({
        ...protectedConfig,
        clientSecret: 'fc-sso:v1:not-valid-ciphertext',
      }),
    }
    const adapters = [
      wrappedAdapter(createAdapter({
        findOne: vi.fn(async () => ({ ...providerRecord(), oidcConfig: '{not-json' }) as never),
      })),
      wrappedAdapter(createAdapter({
        findOne: vi.fn(async () => corruptProvider as never),
      })),
    ]

    for (const adapter of adapters) {
      await expect(adapter.findOne({
        model: 'ssoProvider',
        where: [{ field: 'providerId', value: 'provider-id' }],
      })).rejects.toThrowError(SsoProviderSecretError)
    }
  })

  it('wraps transactional create/read operations without changing transaction semantics', async () => {
    let stored: ProviderRecord | undefined
    const transactionAdapter = createAdapter()
    transactionAdapter.create = vi.fn(async ({ data }) => {
      stored = { id: 'provider-record-id', ...data } as ProviderRecord
      return stored as never
    })
    transactionAdapter.findOne = vi.fn(async () => stored as never)

    const underlying = createAdapter({
      transaction: vi.fn(async callback =>
        callback(transactionAdapter as DBTransactionAdapter)),
    })
    const adapter = wrappedAdapter(underlying)

    const result = await adapter.transaction(async (transaction) => {
      await transaction.create({
        model: 'ssoProvider',
        data: providerRecord(),
      })
      return transaction.findOne<ProviderRecord>({
        model: 'ssoProvider',
        where: [{ field: 'providerId', value: 'provider-id' }],
      })
    })

    expect(JSON.stringify(stored)).not.toContain(CLIENT_SECRET)
    expect(readClientSecret(result!)).toBe(CLIENT_SECRET)
    expect(underlying.transaction).toHaveBeenCalledOnce()
  })

  it('preserves count and delete behavior', async () => {
    const underlying = createAdapter({
      count: vi.fn(async () => 3),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => 2),
    })
    const adapter = wrappedAdapter(underlying)
    const where = [{ field: 'providerId', value: 'provider-id' }]

    await expect(adapter.count({ model: 'ssoProvider', where })).resolves.toBe(3)
    await expect(adapter.delete({ model: 'ssoProvider', where })).resolves.toBeUndefined()
    await expect(adapter.deleteMany({ model: 'ssoProvider', where })).resolves.toBe(2)
    expect(underlying.delete).toHaveBeenCalledOnce()
    expect(underlying.deleteMany).toHaveBeenCalledOnce()
  })
})
