import { getTableColumns } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ssoProviderCredentialMetadata } from '../../server/database/schema'

describe('SSO credential metadata schema', () => {
  it('contains only organization-scoped non-secret credential health fields', () => {
    const columns = Object.keys(getTableColumns(ssoProviderCredentialMetadata))

    expect(columns).toEqual(expect.arrayContaining([
      'id',
      'ssoProviderId',
      'organizationId',
      'credentialKeyId',
      'activatedAt',
      'expiresAt',
      'lastSuccessfulProbeAt',
      'lastProbedAt',
      'lastAlertedAt',
      'lastProbeStatus',
      'consecutiveTransientFailures',
      'createdAt',
      'updatedAt',
    ]))

    const banned = /secret|token|ciphertext|fingerprint|credentialValue/i
    expect(columns.filter(column => banned.test(column))).toEqual([])
  })

  it('migrates provider and organization foreign keys, uniqueness, RLS, and failure-count guard', () => {
    const migration = readFileSync(
      join(process.cwd(), 'server/database/migrations/0063_sso_credential_health.sql'),
      'utf8',
    )

    expect(migration).toContain('REFERENCES "public"."sso_provider"("id") ON DELETE cascade')
    expect(migration).toContain('REFERENCES "public"."organization"("id") ON DELETE cascade')
    expect(migration).toContain('CREATE UNIQUE INDEX "sso_provider_credential_metadata_provider_id_idx"')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('"consecutive_transient_failures" >= 0')
    expect(migration).not.toMatch(/client_secret|access_token|ciphertext|fingerprint|credential_value/i)
  })
})
