import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const databaseEnvKeys = [
  'DATABASE_URL',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'RAILWAY_TCP_PROXY_DOMAIN',
  'RAILWAY_TCP_PROXY_PORT',
] as const

function runDrizzleConfig(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of databaseEnvKeys) delete env[key]
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }

  return spawnSync(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    "const config = (await import('./drizzle.config.ts')).default; console.log(config.dbCredentials.url)",
  ], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
}

function combinedOutput(result: ReturnType<typeof runDrizzleConfig>): string {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

describe('drizzle database URL diagnostics', () => {
  it('does not interpolate the raw DATABASE_URL in the thrown diagnostic', () => {
    const source = readFileSync(resolve(root, 'drizzle.config.ts'), 'utf8')
    const throwBlock = source.slice(source.indexOf('throw new Error'))

    expect(source).not.toContain('Raw DATABASE_URL')
    expect(throwBlock).not.toContain('${raw}')
  })

  it('never includes invalid direct URL secret material in errors', () => {
    const rawUrl = 'postgresql://leak-user:leak-password@leak-host.example:bad-port/leak-db?token=leak-token'
    const result = runDrizzleConfig({ DATABASE_URL: rawUrl })
    const output = combinedOutput(result)

    expect(result.status).not.toBe(0)
    for (const secret of [
      rawUrl,
      'leak-user',
      'leak-password',
      'leak-host.example',
      'leak-db',
      'leak-token',
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('DATABASE_URL hostname')
    expect(output).toContain('PGHOST')
    expect(output).toContain('RAILWAY_TCP_PROXY_DOMAIN')
  })

  it('names only missing variable categories when no usable host is configured', () => {
    const sentinels = {
      PGUSER: 'fallback-secret-user',
      PGPASSWORD: 'fallback-secret-password',
      PGDATABASE: 'fallback-secret-database',
      PGPORT: 'fallback-secret-port',
    }
    const result = runDrizzleConfig(sentinels)
    const output = combinedOutput(result)

    expect(result.status).not.toBe(0)
    for (const secret of Object.values(sentinels)) expect(output).not.toContain(secret)
    expect(output).toContain('DATABASE_URL hostname')
    expect(output).toContain('PGHOST')
    expect(output).toContain('RAILWAY_TCP_PROXY_DOMAIN')
  })

  it('preserves a valid direct DATABASE_URL verbatim', () => {
    const directUrl = 'postgresql://direct-user:direct-password@db.internal:5432/careers'
    const result = runDrizzleConfig({ DATABASE_URL: directUrl })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe(directUrl)
  })

  it('preserves PG fallback URL reconstruction when DATABASE_URL has no hostname', () => {
    const result = runDrizzleConfig({
      DATABASE_URL: 'postgresql:///',
      PGHOST: 'fallback.internal',
      PGPORT: '6543',
      PGUSER: 'fallback user',
      PGPASSWORD: 'p@ss/word',
      PGDATABASE: 'careers',
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe(
      'postgresql://fallback%20user:p%40ss%2Fword@fallback.internal:6543/careers',
    )
  })
})
