import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type EnvMap = Record<string, string | undefined>

export interface E2ESafetyOptions {
  cwd?: string
  env?: EnvMap
  includeProcessEnv?: boolean
  readDotenv?: boolean
}

const DEFAULT_BASE_URL = 'http://localhost:3333'
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'postgres', 'db', 'database'])
const PRODUCTION_APP_HOSTS = new Set(['careers.thefactoryhq.com'])

function parseDotenv(contents: string): EnvMap {
  const values: EnvMap = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue

    const [, key, rawValue] = match
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }

  return values
}

export function loadE2EEnvironment(options: E2ESafetyOptions = {}): EnvMap {
  const cwd = options.cwd ?? process.cwd()
  const shouldReadDotenv = options.readDotenv ?? true
  const dotenvValues: EnvMap = {}

  if (shouldReadDotenv) {
    for (const file of ['.env', '.env.local']) {
      const path = join(cwd, file)
      if (existsSync(path)) {
        Object.assign(dotenvValues, parseDotenv(readFileSync(path, 'utf8')))
      }
    }
  }

  return {
    ...dotenvValues,
    ...(options.includeProcessEnv === false ? {} : process.env),
    ...(options.env ?? {}),
  }
}

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value)
  }
  catch {
    throw new Error(`${label} must be a valid URL for mutating Playwright E2E safety checks.`)
  }
}

function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return LOCAL_DATABASE_HOSTS.has(host)
}

function isLocalHttpHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function isSupabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'supabase.com' || host.endsWith('.supabase.com')
}

export function assertMutatingE2ESafety(options: E2ESafetyOptions = {}) {
  const env = loadE2EEnvironment(options)
  const errors: string[] = []

  const baseUrl = env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL
  const parsedBaseUrl = parseUrl(baseUrl, 'PLAYWRIGHT_BASE_URL')
  const baseHost = parsedBaseUrl.hostname.toLowerCase()

  if (PRODUCTION_APP_HOSTS.has(baseHost)) {
    errors.push(`PLAYWRIGHT_BASE_URL points at the production app host (${baseHost}).`)
  }
  else if (!isLocalHttpHost(baseHost) && env.E2E_ALLOW_REMOTE_BASE_URL !== 'true') {
    errors.push(`PLAYWRIGHT_BASE_URL must be local for this mutating suite unless E2E_ALLOW_REMOTE_BASE_URL=true is set (${baseHost}).`)
  }

  if (env.DATABASE_URL) {
    const databaseUrl = parseUrl(env.DATABASE_URL, 'DATABASE_URL')
    const databaseHost = databaseUrl.hostname.toLowerCase()

    if (isSupabaseHost(databaseHost)) {
      errors.push(`DATABASE_URL points at Supabase (${databaseHost}); use a local or disposable E2E database.`)
    }
    else if (!isLocalDatabaseHost(databaseHost) && env.E2E_ALLOW_REMOTE_DATABASE !== 'true') {
      errors.push(`DATABASE_URL must be local/disposable for this mutating suite unless E2E_ALLOW_REMOTE_DATABASE=true is set (${databaseHost}).`)
    }
  }

  if (errors.length > 0) {
    throw new Error([
      'Refusing to run mutating Playwright E2E against an unsafe target.',
      ...errors.map(error => `- ${error}`),
      'Point DATABASE_URL at a local/test database before running npm run test:e2e.',
    ].join('\n'))
  }
}
