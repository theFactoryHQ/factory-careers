import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assertMutatingE2ESafety,
  loadE2EEnvironment,
} from '../../e2e/safety'

function withTempEnv(files: Record<string, string>, run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-e2e-safety-'))
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(cwd, name), contents)
    }
    run(cwd)
  }
  finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

describe('mutating Playwright E2E safety', () => {
  it('blocks local E2E when Nuxt would load a Supabase database from dotenv', () => {
    withTempEnv({
      '.env.local': 'DATABASE_URL=postgresql://factory_app:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres\n',
    }, (cwd) => {
      expect(() => assertMutatingE2ESafety({
        cwd,
        env: { PLAYWRIGHT_BASE_URL: 'http://localhost:3333' },
        includeProcessEnv: false,
      })).toThrow(/DATABASE_URL.*supabase/i)
    })
  })

  it.each([
    'https://thefactoryhq.com',
    'https://www.thefactoryhq.com',
    'https://careers.thefactoryhq.com',
  ])('blocks known production app hostname %s even when no database is configured', (url) => {
    expect(() => assertMutatingE2ESafety({
      env: { PLAYWRIGHT_BASE_URL: url },
      includeProcessEnv: false,
      readDotenv: false,
    })).toThrow(/PLAYWRIGHT_BASE_URL.*production/i)
  })

  it('blocks remote database hostnames even when they are not Supabase', () => {
    expect(() => assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3333',
        DATABASE_URL: 'postgresql://factory:factory@not-supabase.com:5432/factory_careers_e2e',
      },
      includeProcessEnv: false,
      readDotenv: false,
    })).toThrow(/DATABASE_URL must be local\/disposable/i)
  })

  it('allows local app and local database targets', () => {
    expect(() => assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3333',
        DATABASE_URL: 'postgresql://factory:factory@localhost:5432/factory_careers_e2e',
      },
      includeProcessEnv: false,
      readDotenv: false,
    })).not.toThrow()
  })

  it('loads .env.local after .env so the effective E2E database matches Nuxt', () => {
    withTempEnv({
      '.env': 'DATABASE_URL=postgresql://factory:factory@localhost:5432/factory_careers_e2e\n',
      '.env.local': 'DATABASE_URL=postgresql://factory_app:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres\n',
    }, (cwd) => {
      expect(loadE2EEnvironment({ cwd, env: {}, includeProcessEnv: false }).DATABASE_URL).toContain('supabase.com')
    })
  })
})
