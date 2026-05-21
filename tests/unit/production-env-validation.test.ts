import { describe, expect, it } from 'vitest'
import { parseEnvFile, validateProductionEnv } from '../../scripts/validate-production-env.mjs'

const validProductionEnv = {
  DATABASE_URL: 'postgresql://reqcore:db-secret-value-12345@db.internal:5432/reqcore',
  BETTER_AUTH_SECRET: 'auth-secret-value-that-is-long-enough',
  BETTER_AUTH_URL: 'https://app.example.test',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example.test,https://admin.example.test',
  NUXT_PUBLIC_SITE_URL: 'https://app.example.test',
  S3_ENDPOINT: 'https://storage.example.test',
  S3_ACCESS_KEY: 'prod-access-key',
  S3_SECRET_KEY: 'storage-secret-value-12345',
  S3_BUCKET: 'reqcore-prod',
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: 'false',
  CRON_SECRET: 'cron-secret-value-that-is-long-enough',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'reqcore@example.test',
  SMTP_PASS: 'smtp-secret-value-12345',
  SMTP_FROM: 'Reqcore <noreply@example.test>',
  SMTP_SECURE: 'false',
}

function messages(result: ReturnType<typeof validateProductionEnv>) {
  return [...result.errors, ...result.warnings].map((entry) => `${entry.key}: ${entry.message}`)
}

describe('production environment preflight', () => {
  it('accepts a complete production-like environment', () => {
    const result = validateProductionEnv(validProductionEnv)

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects example-style secrets and public localhost URLs from .env.example', () => {
    const env = parseEnvFile(`
      DATABASE_URL=postgresql://reqcore:change-me@localhost:5432/reqcore
      BETTER_AUTH_SECRET=replace-with-openssl-rand-base64-32-output
      BETTER_AUTH_URL=http://localhost:3000
      NUXT_PUBLIC_SITE_URL=http://localhost:3000
      S3_ENDPOINT=http://localhost:9000
      S3_ACCESS_KEY=reqcore
      S3_SECRET_KEY=change-me
      S3_BUCKET=reqcore
    `)

    const result = validateProductionEnv(env)

    expect(result.ok).toBe(false)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('DATABASE_URL: still looks like an example or placeholder value'),
      expect.stringContaining('BETTER_AUTH_SECRET: still looks like an example or placeholder value'),
      expect.stringContaining('BETTER_AUTH_URL: must use HTTPS in production'),
      expect.stringContaining('BETTER_AUTH_URL: must be the public production hostname'),
      expect.stringContaining('S3_ACCESS_KEY: still looks like an example or placeholder value'),
      expect.stringContaining('S3_SECRET_KEY: still looks like an example or placeholder value'),
    ]))
  })

  it('rejects partial OIDC and OAuth provider configuration', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      OIDC_CLIENT_ID: 'reqcore',
      OIDC_CLIENT_SECRET: 'oidc-secret-value',
      AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('OIDC_DISCOVERY_URL: OIDC_DISCOVERY_URL is required'),
      expect.stringContaining('AUTH_GOOGLE_CLIENT_ID: AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET must be set together'),
    ]))
  })

  it('rejects non-HTTPS provider endpoints in production', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      OIDC_CLIENT_ID: 'reqcore',
      OIDC_CLIENT_SECRET: 'oidc-secret-value',
      OIDC_DISCOVERY_URL: 'http://auth.example.test/.well-known/openid-configuration',
      POSTHOG_PUBLIC_KEY: 'phc_prod_value',
      POSTHOG_HOST: 'http://posthog.example.test',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('OIDC_DISCOVERY_URL: must use HTTPS in production'),
      expect.stringContaining('POSTHOG_HOST: must use HTTPS in production'),
    ]))
  })

  it('warns instead of failing for launch posture gaps that need human approval', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      CRON_SECRET: '',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      RESEND_API_KEY: '',
      POSTHOG_PUBLIC_KEY: 'phc_prod_value',
    })

    expect(result.ok).toBe(true)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('CRON_SECRET: is not set'),
      expect.stringContaining('EMAIL_PROVIDER: no SMTP or Resend provider is configured'),
      expect.stringContaining('POSTHOG_PUBLIC_KEY: is enabled; confirm analytics/telemetry data processor approval'),
    ]))
  })

  it('parses quoted env files without expanding values', () => {
    const env = parseEnvFile(`
      export BETTER_AUTH_URL="https://app.example.test"
      SMTP_FROM='Reqcore <noreply@example.test>'
      HASH_VALUE=abc#not-a-comment
      COMMENTED=value # this is a comment
    `)

    expect(env).toEqual({
      BETTER_AUTH_URL: 'https://app.example.test',
      SMTP_FROM: 'Reqcore <noreply@example.test>',
      HASH_VALUE: 'abc#not-a-comment',
      COMMENTED: 'value',
    })
  })
})
