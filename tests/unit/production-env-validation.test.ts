import { describe, expect, it } from 'vitest'
import { parseEnvFile, validateProductionEnv } from '../../scripts/validate-production-env.mjs'

const validProductionEnv = {
  DATABASE_URL: 'postgresql://factory_careers:db-secret-value-12345@db.internal:5432/factory_careers',
  DATABASE_MIGRATION_URL: 'postgresql://factory_careers_migrator:migration-secret-value-12345@db.internal:5432/factory_careers',
  BETTER_AUTH_SECRET: 'auth-secret-value-that-is-long-enough',
  BETTER_AUTH_URL: 'https://app.example.test',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example.test,https://admin.example.test',
  NUXT_PUBLIC_SITE_URL: 'https://app.example.test',
  S3_ENDPOINT: 'https://storage.example.test',
  S3_ACCESS_KEY: 'prod-access-key',
  S3_SECRET_KEY: 'storage-secret-value-12345',
  S3_BUCKET: 'factory-careers-prod',
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: 'false',
  CRON_SECRET: 'cron-secret-value-that-is-long-enough',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'factory-careers@example.test',
  SMTP_PASS: 'smtp-secret-value-12345',
  SMTP_FROM: 'Factory Careers <noreply@example.test>',
  SMTP_SECURE: 'false',
  SSO_PROVIDER_SECRET_STORAGE_MODE: 'encrypted',
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

  it.each([undefined, '', '   '])('rejects a missing production migration role for %j', (migrationUrl) => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      DATABASE_MIGRATION_URL: migrationUrl,
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toContain(
      'DATABASE_MIGRATION_URL: is required so production deploys can apply schema migrations before serving traffic',
    )
  })

  it('rejects production when runtime schema migrations are disabled', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      SKIP_RUNTIME_MIGRATIONS: 'true',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toContain(
      'SKIP_RUNTIME_MIGRATIONS: cannot be true in production',
    )
  })

  it('rejects a migration URL that reuses the application database role', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      DATABASE_MIGRATION_URL: 'postgresql://factory_careers:another-secret-value-12345@db.internal:5432/factory_careers',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toContain(
      'DATABASE_MIGRATION_URL: must use a database role distinct from DATABASE_URL',
    )
  })

  it.each(['compatibility', 'encrypted'])('accepts %s SSO provider secret storage mode', (mode) => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      SSO_PROVIDER_SECRET_STORAGE_MODE: mode,
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('warns that compatibility mode is limited to the plaintext rollback window', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      SSO_PROVIDER_SECRET_STORAGE_MODE: 'compatibility',
    })

    expect(messages(result)).toContain(
      'SSO_PROVIDER_SECRET_STORAGE_MODE: compatibility stores SSO client secrets as plaintext and must be limited to the rollback window',
    )
  })

  it.each([undefined, '', '   '])('rejects a missing production storage mode for %j', (mode) => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      SSO_PROVIDER_SECRET_STORAGE_MODE: mode,
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toContain(
      'SSO_PROVIDER_SECRET_STORAGE_MODE: must be explicitly set to compatibility or encrypted in production',
    )
  })

  it('rejects unsupported SSO provider secret storage modes', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      SSO_PROVIDER_SECRET_STORAGE_MODE: 'automatic',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toContain(
      'SSO_PROVIDER_SECRET_STORAGE_MODE: must be compatibility or encrypted',
    )
  })

  it('rejects example-style secrets and public localhost URLs from .env.example', () => {
    const env = parseEnvFile(`
      DATABASE_URL=postgresql://factory_careers:change-me@localhost:5432/factory_careers
      BETTER_AUTH_SECRET=replace-with-openssl-rand-base64-32-output
      BETTER_AUTH_URL=http://localhost:3000
      NUXT_PUBLIC_SITE_URL=http://localhost:3000
      S3_ENDPOINT=http://localhost:9000
      S3_ACCESS_KEY=factory_careers
      S3_SECRET_KEY=change-me
      S3_BUCKET=factory-careers
    `)

    const result = validateProductionEnv(env)

    expect(result.ok).toBe(false)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('DATABASE_URL: still looks like an example or placeholder value'),
      expect.stringContaining('BETTER_AUTH_SECRET: still looks like an example or placeholder value'),
      expect.stringContaining('BETTER_AUTH_URL: must use HTTPS in production'),
      expect.stringContaining('BETTER_AUTH_URL: must be the public production hostname'),
      expect.stringContaining('S3_SECRET_KEY: still looks like an example or placeholder value'),
    ]))
  })

  it('rejects partial OIDC and OAuth provider configuration', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      OIDC_CLIENT_ID: 'factory-careers',
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
      OIDC_CLIENT_ID: 'factory-careers',
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

  it('rejects test-only capture modes in production env files', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      FACTORY_EMAIL_TEST_MODE: 'capture',
      FACTORY_AI_TEST_MODE: 'mock',
      FACTORY_AI_CAPTURE_PATH: '/tmp/factory-careers-e2e-ai.jsonl',
      FACTORY_CALENDAR_TEST_MODE: 'mock',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('FACTORY_EMAIL_TEST_MODE: capture mode is not allowed in production'),
      expect.stringContaining('FACTORY_AI_TEST_MODE: mock mode is not allowed in production'),
      expect.stringContaining('FACTORY_CALENDAR_TEST_MODE: mock mode is not allowed in production'),
    ]))
  })

  it('validates explicit production rate-limit overrides', () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      PUBLIC_APPLICATION_RATE_LIMIT_MAX_REQUESTS: '200',
      API_AUTH_WRITE_RATE_LIMIT_MAX_REQUESTS: '250',
      BETTER_AUTH_RATE_LIMIT_MAX_REQUESTS: '1000',
      API_GLOBAL_WRITE_RATE_LIMIT_MAX_REQUESTS: '0',
      PUBLIC_APPLICATION_RATE_LIMIT_WINDOW_MS: 'not-a-number',
    })

    expect(result.ok).toBe(false)
    expect(messages(result)).toEqual(expect.arrayContaining([
      expect.stringContaining('PUBLIC_APPLICATION_RATE_LIMIT_MAX_REQUESTS: is unusually high for public job applications'),
      expect.stringContaining('API_AUTH_WRITE_RATE_LIMIT_MAX_REQUESTS: is unusually high for sign-in/sign-up attempts'),
      expect.stringContaining('BETTER_AUTH_RATE_LIMIT_MAX_REQUESTS: is unusually high for Better Auth account-level throttling'),
      expect.stringContaining('API_GLOBAL_WRITE_RATE_LIMIT_MAX_REQUESTS: must be a positive integer'),
      expect.stringContaining('PUBLIC_APPLICATION_RATE_LIMIT_WINDOW_MS: must be a positive integer'),
    ]))
  })

  it('parses quoted env files without expanding values', () => {
    const env = parseEnvFile(`
      export BETTER_AUTH_URL="https://app.example.test"
      SMTP_FROM='Factory Careers <noreply@example.test>'
      HASH_VALUE=abc#not-a-comment
      COMMENTED=value # this is a comment
    `)

    expect(env).toEqual({
      BETTER_AUTH_URL: 'https://app.example.test',
      SMTP_FROM: 'Factory Careers <noreply@example.test>',
      HASH_VALUE: 'abc#not-a-comment',
      COMMENTED: 'value',
    })
  })
})
