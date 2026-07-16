import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('calendar connection generation migration', () => {
  it('backfills a stable non-null connection generation for every existing integration', () => {
    const migration = readFileSync(
      resolve(root, 'server/database/migrations/0050_calendar_connection_generation.sql'),
      'utf8',
    )
    const schema = readFileSync(resolve(root, 'server/database/schema/app.ts'), 'utf8')
    const journal = readFileSync(resolve(root, 'server/database/migrations/meta/_journal.json'), 'utf8')

    expect(migration).toContain('ADD COLUMN "connection_generation" text')
    expect(migration).toContain('SET "connection_generation" = "id"')
    expect(migration).toContain('ALTER COLUMN "connection_generation" SET NOT NULL')
    expect(schema).toContain("connectionGeneration: text('connection_generation').notNull().$defaultFn(() => crypto.randomUUID())")
    expect(journal).toContain('0050_calendar_connection_generation')
  })
})
