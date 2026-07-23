import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'
import {
  SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX,
  SsoProviderSecretError,
  backfillSsoProviderClientSecrets,
  decryptSsoProviderClientSecret,
  type SsoProviderSecretBackfillResult,
} from '../../server/utils/ssoProviderSecrets'

const ROOT_SECRET = 'postgres-sso-provider-test-secret'.repeat(2)
const adminUrl = process.env.SSO_PROVIDER_SECRETS_PG_TEST_URL
  ?? process.env.PROCESSING_QUEUE_PG_TEST_URL
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function databaseUrl(databaseName: string): string {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

describeWithPostgres('SSO provider secret backfill on PostgreSQL', () => {
  it('locks, encrypts plaintext rows in bounded pages, and remains idempotent', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const databaseName = `careers_sso_secrets_${suffix}`

    try {
      await admin.unsafe(`create database "${databaseName}"`)
      const client = postgres(databaseUrl(databaseName), {
        max: 1,
        onnotice: () => undefined,
      })
      const database = drizzle(client, { schema })

      try {
        await migrate(database, { migrationsFolder })
        const userId = `sso_secret_${suffix}_user`
        const organizationId = `sso_secret_${suffix}_org`
        await client`insert into "user" ("id", "name", "email") values
          (${userId}, 'SSO Secret User', ${`sso-secret-${suffix}@example.com`})`
        await client`insert into "organization" ("id", "name", "slug") values
          (${organizationId}, 'SSO Secret Org', ${`sso-secret-${suffix}`})`

        const plaintextSecret = `plaintext-secret-${suffix}`
        const plaintextConfig = JSON.stringify({
          clientId: 'plaintext-client',
          clientSecret: plaintextSecret,
          tokenEndpoint: 'https://idp.example.com/token',
        })
        const publicConfig = JSON.stringify({
          clientId: 'public-client',
          pkce: true,
        })
        await client`insert into "sso_provider"
          ("id", "issuer", "domain", "oidc_config", "user_id", "provider_id", "organization_id")
          values
          (${`sso_secret_${suffix}_plaintext`}, 'https://idp.example.com', 'plaintext.example.com',
            ${plaintextConfig}, ${userId}, ${`plaintext-${suffix}`}, ${organizationId}),
          (${`sso_secret_${suffix}_public`}, 'https://idp.example.com', 'public.example.com',
            ${publicConfig}, ${userId}, ${`public-${suffix}`}, ${organizationId})`

        const contender = postgres(databaseUrl(databaseName), {
          max: 1,
          onnotice: () => undefined,
        })
        let concurrentResults: SsoProviderSecretBackfillResult[]
        try {
          concurrentResults = await Promise.all([
            backfillSsoProviderClientSecrets(
              client,
              ROOT_SECRET,
              { batchSize: 1 },
            ),
            backfillSsoProviderClientSecrets(
              contender,
              ROOT_SECRET,
              { batchSize: 1 },
            ),
          ])
        }
        finally {
          await contender.end()
        }

        expect(concurrentResults.map(result => result.scanned)).toEqual([2, 2])
        expect(concurrentResults.reduce(
          (total, result) => total + result.encrypted,
          0,
        )).toBe(1)
        expect(concurrentResults.reduce(
          (total, result) => total + result.alreadyEncrypted,
          0,
        )).toBe(1)
        expect(concurrentResults.map(
          result => result.withoutClientSecret,
        )).toEqual([1, 1])

        const [stored] = await client<{ oidcConfig: string }[]>`
          select "oidc_config" as "oidcConfig"
          from "sso_provider"
          where "provider_id" = ${`plaintext-${suffix}`}
        `
        expect(stored).toBeDefined()
        expect(stored!.oidcConfig).not.toContain(plaintextSecret)
        const storedConfig = JSON.parse(stored!.oidcConfig) as {
          clientSecret: string
        }
        expect(storedConfig.clientSecret.startsWith(
          SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX,
        )).toBe(true)
        expect(decryptSsoProviderClientSecret(
          storedConfig.clientSecret,
          ROOT_SECRET,
        )).toBe(plaintextSecret)

        const second = await backfillSsoProviderClientSecrets(
          client,
          ROOT_SECRET,
          { batchSize: 1 },
        )
        expect(second).toEqual({
          scanned: 2,
          encrypted: 0,
          alreadyEncrypted: 1,
          withoutClientSecret: 1,
        })

        await expect(backfillSsoProviderClientSecrets(
          client,
          'rotated-without-reencrypting-existing-providers'.repeat(2),
          { batchSize: 1 },
        )).rejects.toThrowError(SsoProviderSecretError)
      }
      finally {
        await client.end()
      }
    }
    finally {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end()
    }
  }, 60_000)
})
