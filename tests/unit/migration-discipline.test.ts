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

function snapshot(id: string, prevId: string): string {
  return `${JSON.stringify({
    id,
    prevId,
    version: '7',
    dialect: 'postgresql',
    tables: {},
    enums: {},
    schemas: {},
    sequences: {},
    roles: {},
    policies: {},
    views: {},
    _meta: {},
  }, null, 2)}\n`
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

function createPreBaselineRepo(): RepoFixture {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-careers-migrations-'))
  execFileSync('git', ['init', '-q'], { cwd })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd })
  execFileSync('git', ['config', 'user.name', 'Factory Careers Tests'], { cwd })
  write(cwd, 'server/database/migrations/0000_initial.sql', 'create table example (id text);\n')
  write(cwd, 'server/database/migrations/0034_last_snapshot.sql', '-- Last migration with a historical snapshot.\n')
  write(cwd, 'server/database/migrations/0065_historical_gap.sql', '-- Historical migration without a snapshot.\n')
  write(cwd, 'server/database/migrations/meta/0015_snapshot.json', snapshot('legacy-0015', 'missing-0014'))
  write(cwd, 'server/database/migrations/meta/0034_snapshot.json', snapshot('legacy-0034', '00000000-0000-0000-0000-000000000000'))
  write(cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
    version: '7',
    dialect: 'postgresql',
    entries: [
      { idx: 0, version: '7', when: 1000, tag: '0000_initial', breakpoints: true },
      { idx: 34, version: '7', when: 1500, tag: '0034_last_snapshot', breakpoints: true },
      { idx: 65, version: '7', when: 2000, tag: '0065_historical_gap', breakpoints: true },
    ],
  }, null, 2))
  write(cwd, 'server/database/schema/app.ts', 'export const schemaVersion = 1\n')
  return { cwd, base: commit(cwd, 'base') }
}

function appendBaseline(fixture: RepoFixture, contents = snapshot('baseline-0066', 'legacy-0034')): void {
  write(fixture.cwd, 'server/database/migrations/0066_current_schema_snapshot.sql', '-- Current schema snapshot baseline.\n')
  write(fixture.cwd, 'server/database/migrations/meta/0066_snapshot.json', contents)
  write(fixture.cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
    version: '7',
    dialect: 'postgresql',
    entries: [
      { idx: 0, version: '7', when: 1000, tag: '0000_initial', breakpoints: true },
      { idx: 34, version: '7', when: 1500, tag: '0034_last_snapshot', breakpoints: true },
      { idx: 65, version: '7', when: 2000, tag: '0065_historical_gap', breakpoints: true },
      { idx: 66, version: '7', when: 3000, tag: '0066_current_schema_snapshot', breakpoints: true },
    ],
  }, null, 2))
}

function createRepo(): RepoFixture {
  const fixture = createPreBaselineRepo()
  appendBaseline(fixture)
  return { cwd: fixture.cwd, base: commit(fixture.cwd, 'snapshot baseline') }
}

function appendMigration(fixture: RepoFixture, options: { snapshot?: boolean } = {}): void {
  write(fixture.cwd, 'server/database/schema/app.ts', 'export const schemaVersion = 2\n')
  write(fixture.cwd, 'server/database/migrations/0067_add_name.sql', 'alter table example add column name text;\n')
  if (options.snapshot !== false) {
    write(fixture.cwd, 'server/database/migrations/meta/0067_snapshot.json', snapshot('next-0067', 'baseline-0066'))
  }
  write(fixture.cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
    version: '7',
    dialect: 'postgresql',
    entries: [
      { idx: 0, version: '7', when: 1000, tag: '0000_initial', breakpoints: true },
      { idx: 34, version: '7', when: 1500, tag: '0034_last_snapshot', breakpoints: true },
      { idx: 65, version: '7', when: 2000, tag: '0065_historical_gap', breakpoints: true },
      { idx: 66, version: '7', when: 3000, tag: '0066_current_schema_snapshot', breakpoints: true },
      { idx: 67, version: '7', when: 4000, tag: '0067_add_name', breakpoints: true },
    ],
  }, null, 2))
}

function runCheck(fixture: RepoFixture): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [checker, '--base-ref', fixture.base, '--head-ref', 'HEAD'], {
    cwd: fixture.cwd,
    encoding: 'utf8',
  })
}

describe('migration discipline command', () => {
  it('accepts the 0066 bootstrap after base history through 0065 and the 0034 snapshot gap', () => {
    const fixture = createPreBaselineRepo()
    appendBaseline(fixture)
    commit(fixture.cwd, 'current snapshot baseline')

    const result = runCheck(fixture)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('PASS')
  })

  it('accepts SQL, journal, and snapshot additions after the baseline', () => {
    const fixture = createRepo()
    appendMigration(fixture)
    commit(fixture.cwd, 'valid migration')

    const result = runCheck(fixture)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('PASS')
  })

  it('rejects a post-baseline migration without its matching snapshot', () => {
    const fixture = createRepo()
    appendMigration(fixture, { snapshot: false })
    commit(fixture.cwd, 'migration missing snapshot')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('New migration snapshots must exactly match appended journal entries')
  })

  it('rejects a snapshot without a matching appended journal entry', () => {
    const fixture = createRepo()
    write(fixture.cwd, 'server/database/migrations/meta/0067_snapshot.json', snapshot('orphan-0067', 'baseline-0066'))
    commit(fixture.cwd, 'orphan snapshot')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('New migration snapshots must exactly match appended journal entries')
  })

  it('rejects rewritten snapshot history at the fixed baseline', () => {
    const fixture = createRepo()
    write(fixture.cwd, 'server/database/migrations/meta/0066_snapshot.json', snapshot('rewritten-0066', 'legacy-0034'))
    commit(fixture.cwd, 'rewritten snapshot')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Migration snapshot history is immutable')
  })

  it('rejects malformed snapshot JSON', () => {
    const fixture = createRepo()
    appendMigration(fixture)
    write(fixture.cwd, 'server/database/migrations/meta/0067_snapshot.json', '{"id":')
    commit(fixture.cwd, 'malformed snapshot')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Invalid migration snapshot JSON')
  })

  it('rejects a structurally incomplete Drizzle snapshot', () => {
    const fixture = createRepo()
    appendMigration(fixture)
    write(fixture.cwd, 'server/database/migrations/meta/0067_snapshot.json', '{"id":"next-0067","prevId":"baseline-0066"}\n')
    commit(fixture.cwd, 'incomplete snapshot')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must be a Drizzle PostgreSQL snapshot')
  })

  it('rejects copied snapshots with duplicate IDs', () => {
    const fixture = createRepo()
    appendMigration(fixture)
    write(fixture.cwd, 'server/database/migrations/meta/0067_snapshot.json', snapshot('baseline-0066', 'baseline-0066'))
    commit(fixture.cwd, 'copied snapshot id')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Migration snapshot IDs must be unique')
  })

  it('rejects a stale snapshot whose prevId does not reference its predecessor', () => {
    const fixture = createRepo()
    appendMigration(fixture)
    write(fixture.cwd, 'server/database/migrations/meta/0067_snapshot.json', snapshot('next-0067', 'legacy-0034'))
    commit(fixture.cwd, 'stale snapshot predecessor')

    const result = runCheck(fixture)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must reference previous snapshot ID baseline-0066')
  })

  it.each([
    ['modified historical migration', (fixture: RepoFixture) => {
      write(fixture.cwd, 'server/database/migrations/0000_initial.sql', 'create table changed (id text);\n')
    }, 'Applied migration SQL is immutable'],
    ['rewritten journal history', (fixture: RepoFixture) => {
      write(fixture.cwd, 'server/database/migrations/meta/_journal.json', JSON.stringify({
        version: '7',
        dialect: 'postgresql',
        entries: [
          { idx: 0, version: '7', when: 9999, tag: '0000_initial', breakpoints: true },
          { idx: 34, version: '7', when: 1500, tag: '0034_last_snapshot', breakpoints: true },
          { idx: 65, version: '7', when: 2000, tag: '0065_historical_gap', breakpoints: true },
          { idx: 66, version: '7', when: 3000, tag: '0066_current_schema_snapshot', breakpoints: true },
        ],
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
