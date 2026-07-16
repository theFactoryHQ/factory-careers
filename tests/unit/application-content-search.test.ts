import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  applicationContentSearchCondition,
  applicationSearchPattern,
} from '../../server/utils/applicationSearch'
import { applicationQuerySchema } from '../../server/utils/schemas/application'
import { remainingPageBatches } from '../../shared/pagination'

const readProjectFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application content search', () => {
  it('normalizes validated search input and escapes LIKE metacharacters', () => {
    expect(applicationQuerySchema.parse({ search: '  product designer  ' }).search).toBe('product designer')
    expect(applicationSearchPattern('  100%_remote\\role  ')).toBe('%100\\%\\_remote\\\\role%')
    expect(applicationSearchPattern('   ')).toBeNull()
    expect(() => applicationQuerySchema.parse({ search: 'x'.repeat(201) })).toThrow()
  })

  it('compiles an indexed, tenant-scoped application search predicate', () => {
    const source = readProjectFile('server/utils/applicationSearch.ts')
    const route = readProjectFile('server/api/applications/index.get.ts')
    const migration = readProjectFile('server/database/migrations/0049_application_search_document.sql')
    const condition = applicationContentSearchCondition('quantum upholstery', 'org_search')
    const compiled = new PgDialect().sqlToQuery(condition!)

    expect(route).toContain('applicationContentSearchCondition(query.search, orgId)')
    expect(route).toContain('eq(candidate.organizationId, orgId)')
    expect(route).toContain('eq(job.organizationId, orgId)')
    expect(route).toContain('count(*) over()::int')
    expect(source).toContain('${applicationSearchDocument.searchText} ILIKE')
    expect(compiled.sql).toContain('"application_search_document"."search_text" ILIKE')
    expect(compiled.params).toEqual(['org_search', '%quantum upholstery%'])
    expect(migration).toContain('gin_trgm_ops')
    expect(migration).toContain('d.parsed_content::text')
    expect(migration).toContain('CREATE TRIGGER application_search_document_changed')
    expect(migration).toContain('CREATE TRIGGER application_search_analysis_feedback_changed')
    expect(migration).not.toContain('application_compliance_response')
  })

  it('loads every page in bounded batches instead of stopping at 100 applications', () => {
    expect(remainingPageBatches(100, 100)).toEqual([])
    expect(remainingPageBatches(250, 100)).toEqual([[2, 3]])
    expect(remainingPageBatches(1_001, 100)).toEqual([
      [2, 3, 4, 5],
      [6, 7, 8, 9],
      [10, 11],
    ])

    const composable = readProjectFile('app/composables/useApplications.ts')
    const page = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    expect(composable).toContain('remainingPageBatches(firstPage.total, firstPage.limit)')
    expect(page).toContain('allPages: true')
  })

  it('places broad application search above the pipeline and candidate search inside filters', () => {
    const page = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const broadSearch = page.indexOf('aria-label="Search application content"')
    const threePanelLayout = page.indexOf('<!-- THREE-PANEL LAYOUT')
    const filterPanel = page.indexOf('<!-- Filter panel -->')
    const candidateSearch = page.indexOf('aria-label="Search candidates"')

    expect(broadSearch).toBeGreaterThan(-1)
    expect(broadSearch).toBeLessThan(threePanelLayout)
    expect(candidateSearch).toBeGreaterThan(filterPanel)
    expect(page).toContain('search: debouncedApplicationSearch')
    expect(page).toContain('placeholder="Filter by name or email…"')
    expect(page).not.toContain('v-model="searchTerm"')
  })
})
