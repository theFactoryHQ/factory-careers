#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_BUCKET',
]

const SECRET_KEYS = new Set([
  'DATABASE_URL',
  'DB_PASSWORD',
  'STORAGE_PASSWORD',
  'BETTER_AUTH_SECRET',
  'CRON_SECRET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'GITHUB_FEEDBACK_TOKEN',
  'POSTHOG_PUBLIC_KEY',
  'POSTHOG_FEATURE_FLAGS_KEY',
  'RESEND_API_KEY',
  'SMTP_PASS',
  'GOOGLE_CLIENT_SECRET',
  'AUTH_GOOGLE_CLIENT_SECRET',
  'AUTH_GITHUB_CLIENT_SECRET',
  'AUTH_MICROSOFT_CLIENT_SECRET',
  'OIDC_CLIENT_SECRET',
])

const PLACEHOLDER_PATTERNS = [
  /change-?me/i,
  /replace-with/i,
  /your[-_\s]/i,
  /^(?:.*[./:@_-])?example\.com(?:[/?#:._-].*)?$/i,
  /localhost/i,
  /^demo1234$/i,
  /^minioadmin$/i,
  /^reqcore$/i,
  /reqcore-ci/i,
  /reqcore-rehearsal/i,
]

const OAUTH_PAIRS = [
  ['AUTH_GOOGLE_CLIENT_ID', 'AUTH_GOOGLE_CLIENT_SECRET'],
  ['AUTH_GITHUB_CLIENT_ID', 'AUTH_GITHUB_CLIENT_SECRET'],
  ['AUTH_MICROSOFT_CLIENT_ID', 'AUTH_MICROSOFT_CLIENT_SECRET'],
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
]

const OIDC_KEYS = ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_DISCOVERY_URL']

const RATE_LIMIT_SETTINGS = [
  {
    key: 'API_GLOBAL_READ_RATE_LIMIT_MAX_REQUESTS',
    warnAbove: 1000,
    message: 'is unusually high for global read traffic; confirm edge/WAF controls if this is intentional',
  },
  {
    key: 'API_GLOBAL_WRITE_RATE_LIMIT_MAX_REQUESTS',
    warnAbove: 200,
    message: 'is unusually high for write traffic; confirm abuse monitoring before launch',
  },
  {
    key: 'API_AUTH_READ_RATE_LIMIT_MAX_REQUESTS',
    warnAbove: 1200,
    message: 'is unusually high for auth read traffic; confirm brute-force monitoring before launch',
  },
  {
    key: 'API_AUTH_WRITE_RATE_LIMIT_MAX_REQUESTS',
    warnAbove: 100,
    message: 'is unusually high for sign-in/sign-up attempts; confirm brute-force controls before launch',
  },
  {
    key: 'BETTER_AUTH_RATE_LIMIT_MAX_REQUESTS',
    warnAbove: 300,
    message: 'is unusually high for Better Auth account-level throttling; confirm this is not a test-only value',
  },
  {
    key: 'BETTER_AUTH_RATE_LIMIT_WINDOW_SECONDS',
    warnBelow: 30,
    message: 'is a short Better Auth throttling window; confirm brute-force controls before launch',
  },
  {
    key: 'PUBLIC_APPLICATION_RATE_LIMIT_MAX_REQUESTS',
    warnAbove: 20,
    message: 'is unusually high for public job applications; confirm anti-spam controls before launch',
  },
  {
    key: 'PUBLIC_APPLICATION_RATE_LIMIT_WINDOW_MS',
    warnBelow: 60_000,
    message: 'is a short public-application throttling window; confirm anti-spam controls before launch',
  },
]

function trimValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isSet(env, key) {
  return trimValue(env[key]) !== ''
}

function issue(key, message) {
  return { key, message }
}

function parseBoolean(value) {
  const normalized = trimValue(value).toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function parsePositiveInteger(value) {
  const normalized = trimValue(value)
  if (!normalized) return undefined

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined

  return parsed
}

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  )
}

function isPrivateHostname(hostname) {
  return (
    isLocalHostname(hostname) ||
    hostname === 'minio' ||
    hostname === 'db' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  )
}

function isAmazonAwsHostname(hostname) {
  return hostname === 'amazonaws.com' || hostname.endsWith('.amazonaws.com')
}

function hasPlaceholder(key, value) {
  if (!SECRET_KEYS.has(key)) return false
  const text = trimValue(value)
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))
}

function stripInlineComment(value) {
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    const prev = value[i - 1]

    if (char === "'" && !inDouble && prev !== '\\') inSingle = !inSingle
    if (char === '"' && !inSingle && prev !== '\\') inDouble = !inDouble

    if (char === '#' && !inSingle && !inDouble && /\s/.test(prev ?? ' ')) {
      return value.slice(0, i).trimEnd()
    }
  }

  return value
}

function unquote(value) {
  const trimmed = stripInlineComment(value).trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1)
    if (quote === '"') {
      return inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    return inner
  }
  return trimmed
}

export function parseEnvFile(source) {
  const env = {}
  const lines = source.split(/\r?\n/)

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) {
      throw new Error(`Invalid .env line ${index + 1}: ${line}`)
    }

    env[match[1]] = unquote(match[2])
  })

  return env
}

function requireUrl(env, key, errors) {
  const raw = trimValue(env[key])
  if (!raw) return undefined

  const url = parseUrl(raw)
  if (!url) {
    errors.push(issue(key, 'must be a valid URL'))
    return undefined
  }

  return url
}

function checkRequired(env, errors) {
  for (const key of REQUIRED_KEYS) {
    if (!isSet(env, key)) errors.push(issue(key, 'is required for production'))
  }
}

function checkPlaceholders(env, errors) {
  for (const [key, value] of Object.entries(env)) {
    if (hasPlaceholder(key, value)) {
      errors.push(issue(key, 'still looks like an example or placeholder value'))
    }
  }
}

function checkAuth(env, errors, warnings) {
  const authSecret = trimValue(env.BETTER_AUTH_SECRET)
  if (authSecret && authSecret.length < 32) {
    errors.push(issue('BETTER_AUTH_SECRET', 'must be at least 32 characters'))
  }

  const authUrl = requireUrl(env, 'BETTER_AUTH_URL', errors)
  if (authUrl) {
    if (authUrl.protocol !== 'https:') {
      errors.push(issue('BETTER_AUTH_URL', 'must use HTTPS in production'))
    }
    if (isLocalHostname(authUrl.hostname)) {
      errors.push(issue('BETTER_AUTH_URL', 'must be the public production hostname, not localhost'))
    }
    if (authUrl.pathname !== '/' || authUrl.search || authUrl.hash) {
      warnings.push(issue('BETTER_AUTH_URL', 'should be only the origin, for example https://app.example.com'))
    }
  }

  const siteUrl = requireUrl(env, 'NUXT_PUBLIC_SITE_URL', errors)
  if (!siteUrl) {
    warnings.push(issue('NUXT_PUBLIC_SITE_URL', 'is not set; canonical links may not match the production app URL'))
  } else {
    if (siteUrl.protocol !== 'https:') {
      errors.push(issue('NUXT_PUBLIC_SITE_URL', 'must use HTTPS in production'))
    }
    if (isLocalHostname(siteUrl.hostname)) {
      errors.push(issue('NUXT_PUBLIC_SITE_URL', 'must be the public production hostname, not localhost'))
    }
    if (authUrl && siteUrl.origin !== authUrl.origin) {
      warnings.push(issue('NUXT_PUBLIC_SITE_URL', 'does not match BETTER_AUTH_URL origin'))
    }
  }

  if (isSet(env, 'CRON_SECRET')) {
    const cronSecret = trimValue(env.CRON_SECRET)
    if (cronSecret.length < 16) {
      errors.push(issue('CRON_SECRET', 'must be at least 16 characters'))
    } else if (cronSecret.length < 32) {
      warnings.push(issue('CRON_SECRET', 'should be at least 32 characters for production'))
    }
  } else {
    warnings.push(issue('CRON_SECRET', 'is not set; scheduled maintenance endpoints cannot be safely enabled'))
  }

  if (isSet(env, 'BETTER_AUTH_TRUSTED_ORIGINS')) {
    const origins = trimValue(env.BETTER_AUTH_TRUSTED_ORIGINS)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)

    for (const origin of origins) {
      const parsed = parseUrl(origin)
      if (!parsed) {
        errors.push(issue('BETTER_AUTH_TRUSTED_ORIGINS', `"${origin}" is not a valid origin URL`))
        continue
      }
      if (parsed.protocol !== 'https:') {
        errors.push(issue('BETTER_AUTH_TRUSTED_ORIGINS', `"${origin}" must use HTTPS in production`))
      }
      if (parsed.origin !== origin.replace(/\/$/, '')) {
        warnings.push(issue('BETTER_AUTH_TRUSTED_ORIGINS', `"${origin}" should be listed as an origin without path, query, or hash`))
      }
    }
  }
}

function checkDatabase(env, errors, warnings) {
  const databaseUrl = requireUrl(env, 'DATABASE_URL', errors)
  if (!databaseUrl) return

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    errors.push(issue('DATABASE_URL', 'must use postgres:// or postgresql://'))
  }
  if (!databaseUrl.username) {
    errors.push(issue('DATABASE_URL', 'must include a database user'))
  }
  if (!databaseUrl.password) {
    errors.push(issue('DATABASE_URL', 'must include a database password or use a secret manager that injects one'))
  }
  if (isLocalHostname(databaseUrl.hostname)) {
    warnings.push(issue('DATABASE_URL', 'points at localhost; production should use a private managed host or internal service DNS'))
  }

  for (const key of ['DB_PASSWORD']) {
    if (isSet(env, key) && trimValue(env[key]).length < 16) {
      warnings.push(issue(key, 'should be at least 16 characters for production'))
    }
  }
}

function checkStorage(env, errors, warnings) {
  const s3Endpoint = requireUrl(env, 'S3_ENDPOINT', errors)
  if (s3Endpoint) {
    if (s3Endpoint.protocol !== 'https:' && !isPrivateHostname(s3Endpoint.hostname)) {
      errors.push(issue('S3_ENDPOINT', 'must use HTTPS unless it is private internal storage'))
    }
    if (isLocalHostname(s3Endpoint.hostname)) {
      warnings.push(issue('S3_ENDPOINT', 'points at localhost; production should use private service DNS or a managed S3 endpoint'))
    }
  }

  const forcePathStyle = isSet(env, 'S3_FORCE_PATH_STYLE')
    ? parseBoolean(env.S3_FORCE_PATH_STYLE)
    : undefined
  if (isSet(env, 'S3_FORCE_PATH_STYLE') && forcePathStyle === undefined) {
    errors.push(issue('S3_FORCE_PATH_STYLE', 'must be true or false'))
  }
  if (s3Endpoint && forcePathStyle === false && isPrivateHostname(s3Endpoint.hostname)) {
    warnings.push(issue('S3_FORCE_PATH_STYLE', 'is false for private/MinIO-like storage; MinIO usually requires true'))
  }
  if (s3Endpoint && forcePathStyle === true && isAmazonAwsHostname(s3Endpoint.hostname)) {
    warnings.push(issue('S3_FORCE_PATH_STYLE', 'is true for AWS S3; managed S3 providers usually use false'))
  }

  if (isSet(env, 'S3_BUCKET') && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(trimValue(env.S3_BUCKET))) {
    warnings.push(issue('S3_BUCKET', 'is not DNS-style; managed S3 providers may reject it'))
  }

  for (const key of ['STORAGE_PASSWORD', 'S3_SECRET_KEY']) {
    if (isSet(env, key) && trimValue(env[key]).length < 16) {
      warnings.push(issue(key, 'should be at least 16 characters for production'))
    }
  }
}

function checkProviderPairs(env, errors, warnings) {
  for (const [idKey, secretKey] of OAUTH_PAIRS) {
    if (isSet(env, idKey) !== isSet(env, secretKey)) {
      errors.push(issue(idKey, `${idKey} and ${secretKey} must be set together or both omitted`))
    }
  }

  const configuredOidc = OIDC_KEYS.filter((key) => isSet(env, key))
  if (configuredOidc.length > 0 && configuredOidc.length < OIDC_KEYS.length) {
    for (const key of OIDC_KEYS.filter((name) => !isSet(env, name))) {
      errors.push(issue(key, `${key} is required when OIDC SSO is partially configured`))
    }
  }

  if (isSet(env, 'OIDC_DISCOVERY_URL')) {
    const discoveryUrl = requireUrl(env, 'OIDC_DISCOVERY_URL', errors)
    if (discoveryUrl && discoveryUrl.protocol !== 'https:') {
      errors.push(issue('OIDC_DISCOVERY_URL', 'must use HTTPS in production'))
    }
    if (discoveryUrl && !discoveryUrl.pathname.includes('.well-known/openid-configuration')) {
      warnings.push(issue('OIDC_DISCOVERY_URL', 'should point to a .well-known/openid-configuration endpoint'))
    }
  }

  if (isSet(env, 'AUTH_MICROSOFT_CLIENT_ID') && !isSet(env, 'AUTH_MICROSOFT_TENANT_ID')) {
    warnings.push(issue('AUTH_MICROSOFT_TENANT_ID', 'is not set; Better Auth will use its default tenant behavior'))
  }
}

function checkEmail(env, errors, warnings) {
  if (isSet(env, 'SMTP_HOST')) {
    if (isSet(env, 'SMTP_USER') !== isSet(env, 'SMTP_PASS')) {
      errors.push(issue('SMTP_PASS', 'SMTP_USER and SMTP_PASS must be set together, or both omitted for anonymous relay'))
    }

    const port = isSet(env, 'SMTP_PORT') ? Number(trimValue(env.SMTP_PORT)) : 587
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push(issue('SMTP_PORT', 'must be an integer between 1 and 65535'))
    }

    const secure = isSet(env, 'SMTP_SECURE') ? parseBoolean(env.SMTP_SECURE) : false
    if (isSet(env, 'SMTP_SECURE') && secure === undefined) {
      errors.push(issue('SMTP_SECURE', 'must be true or false'))
    }
    if (secure === true && port !== 465) {
      warnings.push(issue('SMTP_SECURE', 'is true but SMTP_PORT is not 465'))
    }
    if (secure === false && port === 465) {
      warnings.push(issue('SMTP_SECURE', 'is false with SMTP_PORT 465; implicit TLS usually requires true'))
    }
    if (!isSet(env, 'SMTP_FROM')) {
      warnings.push(issue('SMTP_FROM', 'is not set; outbound email will use the default sender'))
    }
  }

  if (isSet(env, 'RESEND_API_KEY') && !isSet(env, 'RESEND_FROM_EMAIL')) {
    warnings.push(issue('RESEND_FROM_EMAIL', 'is not set; Resend will use the default sender'))
  }

  if (!isSet(env, 'SMTP_HOST') && !isSet(env, 'RESEND_API_KEY')) {
    warnings.push(issue('EMAIL_PROVIDER', 'no SMTP or Resend provider is configured; production email will only log to console'))
  }
}

function checkTelemetry(env, errors, warnings) {
  if (isSet(env, 'POSTHOG_PUBLIC_KEY')) {
    const posthogHost = trimValue(env.POSTHOG_HOST || 'https://eu.i.posthog.com')
    const url = parseUrl(posthogHost)
    if (!url) {
      errors.push(issue('POSTHOG_HOST', 'must be a valid URL when PostHog is enabled'))
    } else if (url.protocol !== 'https:') {
      errors.push(issue('POSTHOG_HOST', 'must use HTTPS in production'))
    }
    warnings.push(issue('POSTHOG_PUBLIC_KEY', 'is enabled; confirm analytics/telemetry data processor approval before launch'))
  }
}

function checkRateLimitOverrides(env, errors, warnings) {
  for (const setting of RATE_LIMIT_SETTINGS) {
    if (!isSet(env, setting.key)) continue

    const value = parsePositiveInteger(env[setting.key])
    if (value === undefined) {
      errors.push(issue(setting.key, 'must be a positive integer when set'))
      continue
    }

    if (setting.warnAbove !== undefined && value > setting.warnAbove) {
      warnings.push(issue(setting.key, setting.message))
    }
    if (setting.warnBelow !== undefined && value < setting.warnBelow) {
      warnings.push(issue(setting.key, setting.message))
    }
  }
}

function checkTestModes(env, errors) {
  if (trimValue(env.FACTORY_EMAIL_TEST_MODE) === 'capture') {
    errors.push(issue('FACTORY_EMAIL_TEST_MODE', 'capture mode is not allowed in production'))
  }

  if (trimValue(env.FACTORY_AI_TEST_MODE) === 'mock') {
    errors.push(issue('FACTORY_AI_TEST_MODE', 'mock mode is not allowed in production'))
  }
}

export function validateProductionEnv(input) {
  const env = Object.fromEntries(
    Object.entries(input ?? {}).map(([key, value]) => [key, trimValue(value)]),
  )
  const errors = []
  const warnings = []

  checkRequired(env, errors)
  checkPlaceholders(env, errors)
  checkDatabase(env, errors, warnings)
  checkAuth(env, errors, warnings)
  checkStorage(env, errors, warnings)
  checkProviderPairs(env, errors, warnings)
  checkEmail(env, errors, warnings)
  checkTelemetry(env, errors, warnings)
  checkRateLimitOverrides(env, errors, warnings)
  checkTestModes(env, errors)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

function formatIssues(title, issues) {
  if (issues.length === 0) return ''
  const rows = issues.map(({ key, message }) => `- ${key}: ${message}`)
  return `${title}\n${rows.join('\n')}\n`
}

function usage() {
  return `Usage: node scripts/validate-production-env.mjs [--env-file <path>] [path]\n\nValidates production environment variables from the current process or from a .env file.`
}

function parseArgs(argv) {
  const args = [...argv]
  let envFile

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--env-file') {
      envFile = args.shift()
      if (!envFile) throw new Error('--env-file requires a path')
      continue
    }
    if (arg?.startsWith('--env-file=')) {
      envFile = arg.slice('--env-file='.length)
      continue
    }
    if (!envFile && arg && !arg.startsWith('-')) {
      envFile = arg
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { envFile }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error(usage())
    process.exit(2)
  }

  if (args.help) {
    console.log(usage())
    return
  }

  let source = 'process environment'
  let env = process.env

  if (args.envFile) {
    source = args.envFile
    env = parseEnvFile(readFileSync(args.envFile, 'utf8'))
  }

  const result = validateProductionEnv(env)
  console.log(`Factory Careers production environment preflight: ${result.ok ? 'PASS' : 'FAIL'}`)
  console.log(`Source: ${source}`)

  const errorText = formatIssues('Errors:', result.errors)
  const warningText = formatIssues('Warnings:', result.warnings)
  if (errorText) console.error(`\n${errorText}`)
  if (warningText) console.warn(`\n${warningText}`)

  if (!result.ok) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
