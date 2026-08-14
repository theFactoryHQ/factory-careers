import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const checker = join(process.cwd(), 'scripts/check-migration-discipline.mjs')

interface RepoFixture {
  cwd: string
  base: string
}

function write(cwd: string, path: string, contents: string): void {
  const destination = join(cwd, path)
  mkdirSync(join(destination, '..'), { recursive: true })
  writeFileSync(destination, contents)
}

function commit(cwd: string, message: string): string {
  execFileSync('git', ['add', '.'], { cwd })
  execFileSync('git', ['commit', '-m', message], { cwd, stdio: 'ignore' })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
}

function createRepo(): RepoFixture {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-migrations-'))
  execFileSync('git', ['init', '-q'], { cwd })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd })
  execFileSync('git', ['config', 'user.name', 'Factory Careers Tests'], { cwd })
  write(cwd, 'server/database/migrations/0000_initial.sql', 'create table example (id text);\n')
  write(cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
    version: '7',
    dialect: 'postgresql',
    entries: [{ idx: 0, version: '7', when: 1000, tag: '0000_initial', breakpoints: true }],
  }, null, 2))
  write(cwd, 'server/database/schema/app.ts', 'export const schemaVersion = 1\n')
  return { cwd, base: commit(cwd, 'base') }
}

function runCheck(fixture: RepoFixture): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [checker, '--base-ref', fixture.base, '--head-ref', 'HEAD'], {
    cwd: fixture.cwd,
    encoding: 'utf8',
  })
}

describe('migration discipline command', () => {
  it('accepts a schema change with one append-only migration and journal entry', () => {
    const fixture = createRepo()
    write(fixture.cwd, 'server/database/schema/app.ts', 'export const schemaVersion = 2\n')
    write(fixture.cwd, 'server/database/migrations/0001_add_name.sql', 'alter table example add column name text;\n')
    write(fixture.cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [
        { idx: 0, version: '7', when: 1000, tag: '0000_initial', breakpoints: true },
        { idx: 1, version: '7', when: 2000, tag: '0001_add_name', breakpoints: true },
      ],
    }, null, 2))
    commit(fixture.cwd, 'valid migration')

    const result = runCheck(fixture)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('PASS')
  })

  it.each([
    ['modified historical migration', (fixture: RepoFixture) => {
      write(fixture.cwd, 'server/database/migrations/0000_initial.sql', 'create table changed (id text);\n')
    }, 'Applied migration SQL is immutable'],
    ['rewritten journal history', (fixture: RepoFixture) => {
      write(fixture.cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
        version: '7',
        dialect: 'postgresql',
        entries: [{ idx: 0, version: '7', when: 9999, tag: '0000_initial', breakpoints: true }],
      }))
    }, 'Migration journal history is immutable'],
    ['schema change without migration', (fixture: RepoFixture) => {
      write(fixture.cwd, 'server/database/schema/app.ts', 'export const schemaVersion = 2\n')
    }, 'Schema changes require a new migration'],
  ])('rejects a %s', (_name, mutate, expectedError) => {
    const fixture = createRepo()
    mutate(fixture)
    commit(fixture.cwd, 'invalid change')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(expectedError)
  })
})
