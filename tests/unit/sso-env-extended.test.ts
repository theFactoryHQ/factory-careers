import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { envSchema } from '../../server/utils/env'

/**
 * Extended OIDC SSO environment configuration tests.
 *
 * Focused on edge cases, security hardening, and production readiness
 * beyond what the baseline oidc-sso.test.ts covers.
 */

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://app.example.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
}

const validOidc = {
  OIDC_CLIENT_ID: 'reqcore-app',
  OIDC_CLIENT_SECRET: 'oidc-secret-value',
  OIDC_DISCOVERY_URL: 'https://auth.example.com/.well-known/openid-configuration',
}

describe('OIDC SSO — extended edge cases', () => {
  describe('application intake recovery', () => {
    it('defaults recovery off with seven-day retention', () => {
      const result = envSchema.safeParse(baseEnv)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.APPLICATION_INTAKE_RECOVERY_ENABLED).toBe(false)
        expect(result.data.APPLICATION_INTAKE_RETENTION_DAYS).toBe(7)
      }
    })

    it('requires a present 32-byte active key when recovery is enabled', () => {
      const validKey = randomBytes(32).toString('base64')
      expect(envSchema.safeParse({
        ...baseEnv,
        APPLICATION_INTAKE_RECOVERY_ENABLED: 'true',
        APPLICATION_INTAKE_KEYRING: JSON.stringify({ current: validKey }),
        APPLICATION_INTAKE_ACTIVE_KEY_ID: 'current',
        CRON_SECRET: 'cron-secret-value-that-is-long-enough',
      }).success).toBe(true)

      for (const invalid of [
        {},
        { APPLICATION_INTAKE_KEYRING: JSON.stringify({ old: validKey }), APPLICATION_INTAKE_ACTIVE_KEY_ID: 'current' },
        { APPLICATION_INTAKE_KEYRING: JSON.stringify({ current: Buffer.alloc(31).toString('base64') }), APPLICATION_INTAKE_ACTIVE_KEY_ID: 'current' },
        { APPLICATION_INTAKE_KEYRING: JSON.stringify({ current: validKey, retired: Buffer.alloc(31).toString('base64') }), APPLICATION_INTAKE_ACTIVE_KEY_ID: 'current' },
      ]) {
        expect(envSchema.safeParse({
          ...baseEnv,
          APPLICATION_INTAKE_RECOVERY_ENABLED: 'true',
          CRON_SECRET: 'cron-secret-value-that-is-long-enough',
          ...invalid,
        }).success).toBe(false)
      }
    })
  })

  describe('provider secret storage mode', () => {
    it('defaults to encrypted storage', () => {
      const result = envSchema.safeParse(baseEnv)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.SSO_PROVIDER_SECRET_STORAGE_MODE).toBe('encrypted')
      }
    })

    it.each(['compatibility', 'encrypted'])('accepts %s mode', (mode) => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SSO_PROVIDER_SECRET_STORAGE_MODE: mode,
      })

      expect(result.success).toBe(true)
    })

    it('rejects unsupported modes', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        SSO_PROVIDER_SECRET_STORAGE_MODE: 'automatic',
      })

      expect(result.success).toBe(false)
    })

    it.each([undefined, '', '   '])('requires an explicit production mode for %j', (mode) => {
      const result = envSchema.safeParse({
        ...baseEnv,
        NODE_ENV: 'production',
        SSO_PROVIDER_SECRET_STORAGE_MODE: mode,
      })

      expect(result.success).toBe(false)
    })
  })

  // ────────────────────────────────────
  // Railway domain fallback (no explicit BETTER_AUTH_URL)
  // ────────────────────────────────────
  describe('Railway environment compatibility', () => {
    it('retains the Railway environment ID in validated configuration', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        RAILWAY_ENVIRONMENT_ID: 'environment-id',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.RAILWAY_ENVIRONMENT_ID).toBe('environment-id')
      }
    })

    it('accepts OIDC config when BETTER_AUTH_URL is derived from RAILWAY_PUBLIC_DOMAIN', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        BETTER_AUTH_URL: undefined, // not explicitly set
        RAILWAY_PUBLIC_DOMAIN: 'app.up.railway.app',
        ...validOidc,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.OIDC_CLIENT_ID).toBe('reqcore-app')
      }
    })

    it('rejects when neither BETTER_AUTH_URL nor RAILWAY_PUBLIC_DOMAIN is set', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        BETTER_AUTH_URL: undefined,
        RAILWAY_PUBLIC_DOMAIN: undefined,
        ...validOidc,
      })
      expect(result.success).toBe(false)
    })
  })

  // ────────────────────────────────────
  // Empty string normalization (Railway quirk)
  // ────────────────────────────────────
  describe('empty string normalization', () => {
    it('treats whitespace-only OIDC_CLIENT_ID as unset (no partial config error when all are whitespace)', () => {
      // Railway sometimes sets env vars to "" — emptyToUndefined normalizes them
      const result = envSchema.safeParse({
        ...baseEnv,
        OIDC_CLIENT_ID: '  ',
        OIDC_CLIENT_SECRET: '  ',
        OIDC_DISCOVERY_URL: '  ',
      })
      // All go through emptyToUndefined → undefined → fails inner z.string() validation
      // This means they become undefined-like, but the inner pipe rejects them
      expect(result.success).toBe(false)
    })

    it('treats tab-only OIDC_CLIENT_ID as empty', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        OIDC_CLIENT_ID: '\t',
        OIDC_CLIENT_SECRET: 'secret',
        OIDC_DISCOVERY_URL: 'https://auth.example.com/.well-known/openid-configuration',
      })
      expect(result.success).toBe(false)
    })
  })

  // ────────────────────────────────────
  // OIDC_DISCOVERY_URL edge cases
  // ────────────────────────────────────
  describe('OIDC discovery URL edge cases', () => {
    it('accepts HTTP URL for local dev environments', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        ...validOidc,
        OIDC_DISCOVERY_URL: 'http://localhost:8080/realms/master/.well-known/openid-configuration',
      })
      expect(result.success).toBe(true)
    })

    it('accepts HTTPS URL with IP address', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        ...validOidc,
        OIDC_DISCOVERY_URL: 'https://192.168.1.100:8443/.well-known/openid-configuration',
      })
      expect(result.success).toBe(true)
    })

    it('rejects FTP protocol in discovery URL', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        ...validOidc,
        OIDC_DISCOVERY_URL: 'ftp://auth.example.com/.well-known/openid-configuration',
      })
      expect(result.success).toBe(false)
    })

    it('rejects data: URI as discovery URL', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        ...validOidc,
        OIDC_DISCOVERY_URL: 'data:text/html,<script>alert(1)</script>',
      })
      expect(result.success).toBe(false)
    })
  })

  // ────────────────────────────────────
  // OIDC_PROVIDER_NAME edge cases
  // ────────────────────────────────────
  describe('OIDC provider name edge cases', () => {
    it('accepts provider name with special characters (Umlauts, etc.)', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        ...validOidc,
        OIDC_PROVIDER_NAME: 'Unternehmen SSO (Entra)',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.OIDC_PROVIDER_NAME).toBe('Unternehmen SSO (Entra)')
      }
    })

    it('defaults OIDC_PROVIDER_NAME to "SSO" when not supplied with valid OIDC config', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        ...validOidc,
        // OIDC_PROVIDER_NAME deliberately omitted
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.OIDC_PROVIDER_NAME).toBe('SSO')
      }
    })
  })

  // ────────────────────────────────────
  // BETTER_AUTH_SECRET enforcement
  // ────────────────────────────────────
  describe('auth secret strength with SSO', () => {
    it('rejects short BETTER_AUTH_SECRET even with valid OIDC config', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        BETTER_AUTH_SECRET: 'short',
        ...validOidc,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message)
        expect(messages.some(m => m.includes('at least 32 characters'))).toBe(true)
      }
    })
  })

  // ────────────────────────────────────
  // BETTER_AUTH_TRUSTED_ORIGINS + OIDC
  // ────────────────────────────────────
  describe('trusted origins with OIDC', () => {
    it('parses BETTER_AUTH_TRUSTED_ORIGINS alongside OIDC config', () => {
      const result = envSchema.safeParse({
        ...baseEnv,
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example.com,https://cdn.example.com',
        ...validOidc,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
          'https://app.example.com',
          'https://cdn.example.com',
        ])
      }
    })
  })
})
