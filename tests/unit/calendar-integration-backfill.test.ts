import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'server/database/migrations/0049_google_calendar_organization_backfill.sql',
)

describe('Google Calendar organization backfill migration', () => {
  it('backfills only unowned Google integrations with exactly one membership', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('FROM "member"')
    expect(migration).toContain('GROUP BY "user_id"')
    expect(migration).toContain('HAVING COUNT(*) = 1')
    expect(migration).toContain('UPDATE "calendar_integration" AS "integration"')
    expect(migration).toContain('"integration"."provider" = \'google\'')
    expect(migration).toContain('"integration"."organization_id" IS NULL')
  })

  it('avoids organization-provider conflicts instead of guessing ownership', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('COUNT(*) OVER (PARTITION BY "membership"."organization_id")')
    expect(migration).toContain('"organization_candidate_count" = 1')
    expect(migration).toContain('NOT EXISTS')
    expect(migration).toContain('"existing"."provider" = \'google\'')
  })

  it('registers migration 0049 in the Drizzle journal', () => {
    const journal = JSON.parse(readFileSync(
      join(process.cwd(), 'server/database/migrations/meta/_journal.json'),
      'utf8',
    )) as { entries: Array<{ idx: number, tag: string }> }

    expect(journal.entries).toContainEqual(expect.objectContaining({
      idx: 49,
      tag: '0049_google_calendar_organization_backfill',
    }))
  })
})
