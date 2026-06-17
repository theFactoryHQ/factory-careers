import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createJobSchema, updateJobSchema } from '../../server/utils/schemas/job'
import { publicJobsQuerySchema } from '../../server/utils/schemas/publicApplication'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job listing structure', () => {
  it('defines Factory division options and structured description helpers', async () => {
    const listingStructure = await import('../../shared/job-listing-structure')

    expect(listingStructure.FACTORY_DIVISIONS).toEqual([
      { value: 'factory_capital', label: 'Factory Capital' },
      { value: 'factory_services', label: 'Factory Services' },
      { value: 'factory_partners', label: 'Factory Partners' },
      { value: 'factory_entertainment', label: 'Factory Entertainment' },
      { value: 'factory_cares', label: 'Factory Cares' },
      { value: 'factory_club', label: 'Factory Club' },
    ])

    const blocks = listingStructure.normalizeJobDescriptionBlocks([
      { type: 'paragraph', body: '  Build with operators across the Factory platform.  ' },
      { type: 'bullet_list', heading: 'You will', items: ['  Lead searches ', '', 'Run structured hiring loops'] },
      { type: 'paragraph', body: '   ' },
    ])

    expect(blocks).toEqual([
      { type: 'paragraph', body: 'Build with operators across the Factory platform.' },
      { type: 'bullet_list', heading: 'You will', items: ['Lead searches', 'Run structured hiring loops'] },
    ])
    expect(listingStructure.jobDescriptionBlocksToMarkdown(blocks)).toBe([
      'Build with operators across the Factory platform.',
      '### You will',
      '- Lead searches',
      '- Run structured hiring loops',
    ].join('\n\n'))
    expect(listingStructure.jobDescriptionBlocksToPlainText(blocks)).toContain('You will')
    expect(listingStructure.legacyDescriptionToBlocks('Legacy description')).toEqual([
      { type: 'paragraph', body: 'Legacy description' },
    ])
  })

  it('validates listing divisions and description blocks on job schemas', () => {
    const descriptionBlocks = [
      { type: 'paragraph', body: 'Work across Factory divisions.' },
      { type: 'bullet_list', heading: 'Responsibilities', items: ['Build systems'] },
    ] as const

    expect(createJobSchema.parse({
      title: 'Platform Recruiter',
      divisions: ['factory_services', 'factory_club'],
      descriptionBlocks,
    })).toMatchObject({
      divisions: ['factory_services', 'factory_club'],
      descriptionBlocks,
    })

    expect(updateJobSchema.parse({
      divisions: ['factory_capital'],
      descriptionBlocks,
    })).toMatchObject({
      divisions: ['factory_capital'],
      descriptionBlocks,
    })

    expect(createJobSchema.safeParse({
      title: 'Invalid division',
      divisions: ['not_a_factory_division'],
    }).success).toBe(false)
  })

  it('persists and returns listing divisions and description blocks across job routes', () => {
    const appSchema = readProjectFile('server/database/schema/app.ts')
    const createRoute = readProjectFile('server/api/jobs/index.post.ts')
    const getRoute = readProjectFile('server/api/jobs/[id].get.ts')
    const listRoute = readProjectFile('server/api/jobs/index.get.ts')
    const patchRoute = readProjectFile('server/api/jobs/[id].patch.ts')
    const publicList = readProjectFile('server/api/public/jobs/index.get.ts')
    const publicDetail = readProjectFile('server/api/public/jobs/[slug].get.ts')
    const migration = readProjectFile('server/database/migrations/0047_job_listing_structure.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(appSchema).toContain("divisions: jsonb('divisions')")
    expect(appSchema).toContain("descriptionBlocks: jsonb('description_blocks')")
    expect(createRoute).toContain('const descriptionBlocks = normalizeJobDescriptionBlocks(body.descriptionBlocks)')
    expect(createRoute).toContain('divisions: body.divisions')
    expect(createRoute).toContain('descriptionBlocks')
    expect(patchRoute).toContain('jobDescriptionBlocksToMarkdown(descriptionBlocks)')
    expect(getRoute).toContain('divisions: true')
    expect(getRoute).toContain('descriptionBlocks: true')
    expect(listRoute).toContain('divisions: true')
    expect(publicList).toContain('buildDivisionFilter(query.divisions)')
    expect(publicList).toContain('descriptionBlocks: true')
    expect(publicDetail).toContain('descriptionBlocks: true')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "divisions" jsonb')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "description_blocks" jsonb')
    expect(journal).toContain('"tag": "0047_job_listing_structure"')
  })

  it('supports public job board division filtering and dashboard editor wiring', () => {
    expect(publicJobsQuerySchema.parse({
      divisions: 'factory_capital,factory_club',
    }).divisions).toEqual(['factory_capital', 'factory_club'])

    const createPage = readProjectFile('app/pages/dashboard/jobs/new.vue')
    const editPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const publicIndex = readProjectFile('app/pages/jobs/index.vue')
    const publicDetail = readProjectFile('app/pages/jobs/[slug]/index.vue')
    const useJobs = readProjectFile('app/composables/useJobs.ts')
    const useJob = readProjectFile('app/composables/useJob.ts')
    const cliSchemas = readProjectFile('packages/careers-cli/src/schemas.ts')

    expect(createPage).toContain('JobDivisionMultiSelect')
    expect(createPage).toContain('JobDescriptionBlocksEditor')
    expect(editPage).toContain('JobDivisionMultiSelect')
    expect(editPage).toContain('JobDescriptionBlocksEditor')
    expect(publicIndex).toContain('divisionFilterOptions')
    expect(publicIndex).toContain('formatDivisionLabel')
    expect(publicDetail).toContain('job.value?.descriptionBlocks')
    expect(useJobs).toContain('divisions?: FactoryDivision[]')
    expect(useJobs).toContain('descriptionBlocks?: JobDescriptionBlock[]')
    expect(useJob).toContain('descriptionBlocks?: JobDescriptionBlock[]')
    expect(cliSchemas).toContain('descriptionBlocks: jobDescriptionBlocksSchema.optional()')
  })

  it('keeps long description block editors navigable with collapsible sections', () => {
    const editor = readProjectFile('app/components/JobDescriptionBlocksEditor.vue')

    expect(editor).toContain('collapsedBlockIndexes')
    expect(editor).toContain('toggleBlockCollapsed')
    expect(editor).toContain('aria-expanded')
    expect(editor).toContain('isBlockCollapsed(index)')
    expect(editor).toContain('{{ index + 1 }}')
    expect(editor).toContain('{{ getBlockKindLabel(block) }}')
    expect(editor).toContain('group/block-toggle')
    expect(editor).toContain('hover:ring-brand-500/25')
    expect(editor).toContain('group-hover/block-toggle:bg-brand-100')
    expect(editor).toContain('dark:group-hover/block-toggle:text-brand-200')
    expect(editor).toContain('Trash2')
    expect(editor).toContain('<Trash2 class="size-3.5" />')
    expect(editor).toContain('ui-button ui-button-ghost ui-button-ghost-danger')
    expect(editor).toContain('absolute right-3 top-3')
    expect(editor).toContain('group-hover/description-block:opacity-100')
    expect(editor).toContain('hover:bg-danger-50')
    expect(editor).toContain('dark:hover:bg-danger-950/40')
    expect(editor).toContain('aria-label="Use paragraph block"')
    expect(editor).toContain('aria-label="Use bullet section block"')
    expect(editor).toContain(':aria-pressed="block.type === \'paragraph\'"')
    expect(editor).toContain(':aria-pressed="block.type === \'bullet_list\'"')
    expect(editor).toContain('inline-flex size-8 items-center justify-center')
    expect(editor).toContain('blockTypeDrafts')
    expect(editor).toContain('captureBlockTypeDraft')
    expect(editor).toContain('createBlockFromDraft')
    expect(editor).not.toContain("updateBlock(index, type === 'paragraph' ? emptyParagraph() : emptyBulletList())")
    expect(editor).not.toContain('getBlockTitle')
    expect(editor).not.toContain('getBlockSummary')
  })

  it('keeps application form panels navigable with collapsible sections', () => {
    const editPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(editPage).toContain('DashboardCollapsibleSection')
    const headerActionsIndex = editPage.indexOf('data-testid="application-form-header-actions"')
    const previewActionIndex = editPage.indexOf('Preview form')
    const saveChangesIndex = editPage.indexOf("{{ isSavingPosting ? 'Saving...' : 'Save changes' }}")
    const formStartIndex = editPage.indexOf('<form class="space-y-6"')

    expect(headerActionsIndex).toBeGreaterThan(-1)
    expect(previewActionIndex).toBeGreaterThan(headerActionsIndex)
    expect(saveChangesIndex).toBeGreaterThan(headerActionsIndex)
    expect(saveChangesIndex).toBeLessThan(formStartIndex)
    expect(editPage).not.toContain('Save application details')

    for (const sectionId of [
      'application-section-basic-details',
      'application-section-salary',
      'application-section-schedule',
      'application-section-requirements',
      'application-section-compliance',
      'application-section-questions',
      'application-section-tracking',
    ]) {
      expect(editPage).toContain(`id="${sectionId}"`)
    }
    expect(editPage).toContain(':default-open="true"')

    const collapsibleSection = readProjectFile('app/components/DashboardCollapsibleSection.vue')
    expect(collapsibleSection).toContain('<details')
    expect(collapsibleSection).toContain('<summary')
    expect(collapsibleSection).toContain(':open="defaultOpen"')
    expect(collapsibleSection).toContain('role="region"')
    expect(collapsibleSection).toContain('group-open:rotate-0')
    expect(collapsibleSection).toContain('ChevronDown')
  })
})
