import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('processing data RLS migration', () => {
  it('protects every internal search and processing table from Supabase client roles', () => {
    const migration = read('server/database/migrations/0057_processing_search_rls.sql')

    for (const table of [
      'application_search_document',
      'application_search_refresh_queue',
      'processing_batch',
      'processing_task',
      'processing_batch_item',
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ON "${table}"`)
    }

    expect(migration).toContain("CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])")
    expect(migration).toContain('WITH CHECK')
  })
})
