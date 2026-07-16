import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('processing schema advisory migration', () => {
  it('pins recruiter-search function resolution to trusted schemas', () => {
    const migration = read('server/database/migrations/0058_processing_schema_advisories.sql')

    for (const signature of [
      'refresh_application_search_document(text)',
      'queue_application_search_document(text)',
      'flush_application_search_document_queue()',
      'queue_application_search_for_candidate(text)',
      'queue_application_search_for_job(text)',
      'queue_application_search_for_entity(text, text)',
      'queue_application_search_for_property_definition(text)',
      'queue_application_search_for_tracking_link(text)',
      'application_search_refresh_trigger()',
    ]) {
      expect(migration).toContain(`ALTER FUNCTION public.${signature} SET search_path = pg_catalog, public`)
    }
  })

  it('protects device authorization and covers composite processing foreign keys', () => {
    const migration = read('server/database/migrations/0058_processing_schema_advisories.sql')

    expect(migration).toContain('ALTER TABLE "device_code" ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('ON "device_code"')
    expect(migration).toContain("CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])")
    expect(migration).toContain('("batch_id", "organization_id")')
    expect(migration).toContain('("task_id", "organization_id")')
  })
})
