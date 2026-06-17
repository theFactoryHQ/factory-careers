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
      { type: 'paragraph', heading: '  Platform scope  ', body: '  Build with operators across the Factory platform.  ' },
      { type: 'bullet_list', heading: 'You will', items: ['  Lead searches ', '', 'Run structured hiring loops'] },
      { type: 'paragraph', body: '   ' },
    ])

    expect(blocks).toEqual([
      { type: 'paragraph', heading: 'Platform scope', body: 'Build with operators across the Factory platform.' },
      { type: 'bullet_list', heading: 'You will', items: ['Lead searches', 'Run structured hiring loops'] },
    ])
    expect(listingStructure.jobDescriptionBlocksToMarkdown(blocks)).toBe([
      '### Platform scope',
      'Build with operators across the Factory platform.',
      '### You will',
      '- Lead searches',
      '- Run structured hiring loops',
    ].join('\n\n'))
    expect(listingStructure.jobDescriptionBlocksToPlainText(blocks)).toContain('Platform scope')
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
    const divisionMultiSelect = readProjectFile('app/components/JobDivisionMultiSelect.vue')
    const useJobs = readProjectFile('app/composables/useJobs.ts')
    const useJob = readProjectFile('app/composables/useJob.ts')
    const cliSchemas = readProjectFile('packages/careers-cli/src/schemas.ts')

    expect(createPage).toContain('JobDivisionMultiSelect')
    expect(createPage).toContain('JobDescriptionBlocksEditor')
    expect(editPage).toContain('JobDivisionMultiSelect')
    expect(editPage).toContain('JobDescriptionBlocksEditor')
    expect(publicIndex).toContain('divisionFilterOptions')
    expect(publicIndex).toContain('formatDivisionLabel')
    expect(publicIndex).toContain(":class=\"typeFilter ? 'text-white' : 'text-white/55'\"")
    expect(publicDetail).toContain('job.value?.descriptionBlocks')
    expect(divisionMultiSelect).toContain('selectedDivisionOptions')
    expect(divisionMultiSelect).toContain('v-for="option in selectedDivisionOptions"')
    expect(divisionMultiSelect).toContain('data-testid="selected-division-badge"')
    expect(divisionMultiSelect).toContain("props.tone === 'public' ? 'text-brand-500' : 'text-surface-500 dark:text-surface-400'")
    expect(divisionMultiSelect).toContain(':class="[chevronClass, { \'rotate-180\': open }]"')
    expect(divisionMultiSelect).not.toContain('class="size-4 shrink-0 text-brand-500')
    expect(divisionMultiSelect).not.toContain('return `${selectedValues.value.length} divisions`')
    expect(useJobs).toContain('divisions?: FactoryDivision[]')
    expect(useJobs).toContain('descriptionBlocks?: JobDescriptionBlock[]')
    expect(useJob).toContain('descriptionBlocks?: JobDescriptionBlock[]')
    expect(cliSchemas).toContain('descriptionBlocks: jobDescriptionBlocksSchema.optional()')
  })

  it('places public listing division badges inline after location with uppercase Factory treatment', () => {
    const publicIndex = readProjectFile('app/pages/jobs/index.vue')
    const cardMeta = publicIndex.match(/<!-- Meta -->[\s\S]*?<!-- Description preview -->/)?.[0] ?? ''
    const locationIndex = cardMeta.indexOf('j.location')
    const divisionIndex = cardMeta.indexOf('v-for="division in getJobDivisions(j.divisions)"')
    const postedIndex = cardMeta.indexOf('Posted {{ formatPostedDate')

    expect(publicIndex).toContain('function formatDivisionBadgeSuffix')
    expect(publicIndex).toContain('Clock')
    expect(cardMeta).toContain('text-brand-500">FACTORY</span>')
    expect(cardMeta).toContain('uppercase tracking-[0.16em]')
    expect(cardMeta).toContain('<Clock class="size-3.5" />')
    expect(locationIndex).toBeGreaterThan(-1)
    expect(divisionIndex).toBeGreaterThan(locationIndex)
    expect(postedIndex).toBeGreaterThan(divisionIndex)
    expect(cardMeta).not.toContain('class="mt-3 flex flex-wrap gap-2"')
  })

  it('keeps long description block editors navigable with collapsible sections', () => {
    const editor = readProjectFile('app/components/JobDescriptionBlocksEditor.vue')

    expect(editor).toContain('collapsedBlockIndexes')
    expect(editor).toContain('toggleBlockCollapsed')
    expect(editor).toContain('aria-expanded')
    expect(editor).toContain('isBlockCollapsed(index)')
    expect(editor).toContain('{{ index + 1 }}')
    expect(editor).toContain('getBlockHeadingValue')
    expect(editor).toContain('getBlockHeadingPlaceholder')
    expect(editor).toContain('updateBlockHeading')
    expect(editor).toContain('aria-label="Description section title"')
    expect(editor).toContain(':placeholder="getBlockHeadingPlaceholder(block)"')
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
    expect(editor).toContain('aria-label="Add bullet point"')
    expect(editor).toContain('data-testid="add-bullet-inline-action"')
    expect(editor).toContain('group/add-bullet')
    expect(editor).toContain('rounded-full border border-transparent')
    expect(editor).toContain('group-hover/add-bullet:bg-brand-500/10')
    expect(editor).toContain('blockTypeDrafts')
    expect(editor).toContain('captureBlockTypeDraft')
    expect(editor).toContain('createBlockFromDraft')
    expect(editor).not.toContain('ui-button ui-button-secondary h-8 px-3 text-xs')
    expect(editor).not.toContain('placeholder="Section heading"')
    expect(editor).not.toContain('{{ getBlockKindLabel(block) }}')
    expect(editor).not.toContain("updateBlock(index, type === 'paragraph' ? emptyParagraph() : emptyBulletList())")
    expect(editor).not.toContain('getBlockTitle')
    expect(editor).not.toContain('getBlockSummary')
  })

  it('keeps application form panels navigable with collapsible sections', () => {
    const editPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(editPage).toContain('DashboardCollapsibleSection')
    expect(editPage).toContain('DashboardSectionStack')
    expect(editPage).toContain('data-testid="application-section-organizer"')
    const headerActionsIndex = editPage.indexOf('data-testid="application-form-header-actions"')
    const previewActionIndex = editPage.indexOf('Preview', headerActionsIndex)
    const saveActionIndex = editPage.indexOf("{{ isSavingPosting ? 'Saving...' : 'Save' }}")
    const formStartIndex = editPage.indexOf('<form class="contents"')

    expect(headerActionsIndex).toBeGreaterThan(-1)
    expect(previewActionIndex).toBeGreaterThan(headerActionsIndex)
    expect(saveActionIndex).toBeGreaterThan(headerActionsIndex)
    expect(saveActionIndex).toBeLessThan(formStartIndex)
    expect(editPage).not.toContain('Preview form')
    expect(editPage).not.toContain("'Save changes'")
    expect(editPage).not.toContain('Save application details')
    expect(editPage).not.toContain('class="mb-6"')
    expect(editPage).not.toContain('<form class="space-y-6"')

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

    const sectionStack = readProjectFile('app/components/DashboardSectionStack.vue')
    expect(sectionStack).toContain('class="grid gap-6"')
  })

  it('keeps the application slug synced to the title until manually edited', () => {
    const editPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const slugify = readProjectFile('server/utils/slugify.ts')

    expect(slugify).not.toContain('shortId')
    expect(slugify).not.toContain('id.replace')
    expect(slugify).toContain("return base || 'job'")
    expect(editPage).toContain('const slugManuallyEdited = ref(false)')
    expect(editPage).toContain('function generateTitleSlug')
    expect(editPage).toContain('function looksLikeGeneratedSlug')
    expect(editPage).toContain('function markSlugManuallyEdited')
    expect(editPage).toContain('watch(() => form.value.title')
    expect(editPage).toContain('@input="markSlugManuallyEdited"')
    expect(editPage).toContain('Auto-updates from the title until edited.')
  })

  it('resolves duplicate job slugs with readable suffixes instead of id fragments', () => {
    const createRoute = readProjectFile('server/api/jobs/index.post.ts')
    const patchRoute = readProjectFile('server/api/jobs/[id].patch.ts')
    const slugify = readProjectFile('server/utils/slugify.ts')

    expect(slugify).toContain('export async function generateUniqueJobSlug')
    expect(slugify).toContain('appendJobSlugSuffix')
    expect(slugify).toContain('statusCode: 409')
    expect(createRoute).toContain('await generateUniqueJobSlug')
    expect(patchRoute).toContain('await generateUniqueJobSlug')
    expect(patchRoute).toContain('body.slug !== undefined')
  })
})
