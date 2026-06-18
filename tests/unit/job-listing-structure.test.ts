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
    const jobLocation = await import('../../shared/job-location')

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
    expect(jobLocation.parseJobLocation('Los Angeles, CA')).toEqual({ city: 'Los Angeles', state: 'CA' })
    expect(jobLocation.parseJobLocation('Remote / United States')).toEqual({ city: 'Remote / United States', state: '' })
    expect(jobLocation.parseJobLocation('Austin, Texas')).toEqual({ city: 'Austin, Texas', state: '' })
    expect(jobLocation.buildJobLocation({ city: ' Los Angeles ', state: 'CA' })).toBe('Los Angeles, CA')
    expect(jobLocation.buildJobLocation({ city: 'Remote / United States', state: '' })).toBe('Remote / United States')
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
      salaryDisplayOnListing: false,
    })

    expect(createJobSchema.parse({
      title: 'Published salary role',
      salaryDisplayOnListing: true,
    })).toMatchObject({
      salaryDisplayOnListing: true,
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

  it('keeps salary ranges internal unless display on listing is enabled', async () => {
    const { stripSalaryForHiddenListing } = await import('../../server/utils/publicSalaryVisibility')

    expect(stripSalaryForHiddenListing({
      salaryDisplayOnListing: false,
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: 'USD',
      salaryUnit: 'YEAR',
      salaryNegotiable: true,
    })).toMatchObject({
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryUnit: null,
      salaryNegotiable: false,
    })
    expect(stripSalaryForHiddenListing({
      salaryDisplayOnListing: true,
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: 'USD',
      salaryUnit: 'YEAR',
      salaryNegotiable: false,
    })).toMatchObject({
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: 'USD',
      salaryUnit: 'YEAR',
    })

    expect(updateJobSchema.parse({
      salaryMin: 120000,
      salaryMax: 160000,
      salaryDisplayOnListing: true,
    })).toMatchObject({
      salaryDisplayOnListing: true,
    })

    const appSchema = readProjectFile('server/database/schema/app.ts')
    const createRoute = readProjectFile('server/api/jobs/index.post.ts')
    const getRoute = readProjectFile('server/api/jobs/[id].get.ts')
    const patchRoute = readProjectFile('server/api/jobs/[id].patch.ts')
    const publicList = readProjectFile('server/api/public/jobs/index.get.ts')
    const publicDetail = readProjectFile('server/api/public/jobs/[slug].get.ts')
    const publicSalaryVisibility = readProjectFile('server/utils/publicSalaryVisibility.ts')
    const editPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const publicDetailPage = readProjectFile('app/pages/jobs/[slug]/index.vue')
    const useJob = readProjectFile('app/composables/useJob.ts')
    const cliSchemas = readProjectFile('packages/careers-cli/src/schemas.ts')
    const migration = readProjectFile('server/database/migrations/0048_salary_display_on_listing.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(appSchema).toContain("salaryDisplayOnListing: boolean('salary_display_on_listing').notNull().default(false)")
    expect(createRoute).toContain('salaryDisplayOnListing: body.salaryDisplayOnListing')
    expect(createRoute).toContain('salaryDisplayOnListing: job.salaryDisplayOnListing')
    expect(patchRoute).toContain('salaryDisplayOnListing: job.salaryDisplayOnListing')
    expect(getRoute).toContain('salaryDisplayOnListing: true')
    expect(publicList).toContain('stripSalaryForHiddenListing')
    expect(publicList).toContain('salaryDisplayOnListing: true')
    expect(publicDetail).toContain('stripSalaryForHiddenListing')
    expect(publicDetail).toContain('salaryDisplayOnListing: true')
    expect(publicSalaryVisibility).toContain('salaryDisplayOnListing')
    expect(publicSalaryVisibility).toContain('salaryMin: null')
    expect(publicSalaryVisibility).toContain('salaryNegotiable: false')
    expect(editPage).toContain('salaryDisplayOnListing: false')
    expect(editPage).toContain('salaryDisplayOnListing: j.salaryDisplayOnListing ?? false')
    expect(editPage).toContain('salaryDisplayOnListing: form.value.salaryDisplayOnListing')
    expect(editPage).toContain('id="application-salary-display-on-listing"')
    expect(editPage).toContain('Display on listing')
    expect(editPage).toContain("postingErrors.value.salaryMin = 'Minimum salary is required'")
    expect(editPage).toContain("postingErrors.value.salaryMax = 'Maximum salary is required'")
    expect(editPage).toContain('required')
    expect(editPage).not.toContain('salaryMin: form.value.salaryNegotiable ? null')
    expect(editPage).not.toContain('<template v-if="!form.salaryNegotiable">')
    expect(publicDetailPage).toContain('job.salaryDisplayOnListing &&')
    expect(useJob).toContain('salaryDisplayOnListing: boolean')
    expect(cliSchemas).toContain('salaryDisplayOnListing: z.boolean().optional()')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "salary_display_on_listing" boolean DEFAULT false NOT NULL')
    expect(journal).toContain('"tag": "0048_salary_display_on_listing"')
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
    const headingInput = editor.match(/<input\s+data-testid="description-block-heading-input"[\s\S]*?@input="onBlockHeadingInput\(index, \$event\)"\s+\/>/)?.[0] ?? ''

    expect(editor).toContain('collapsedBlockIndexes')
    expect(editor).toContain('toggleBlockCollapsed')
    expect(editor).toContain('aria-expanded')
    expect(editor).toContain('isBlockCollapsed(index)')
    expect(editor).toContain('{{ index + 1 }}')
    expect(editor).toContain('getBlockHeadingValue')
    expect(editor).toContain('getBlockHeadingPlaceholder')
    expect(editor).toContain('updateBlockHeading')
    expect(editor).toContain('function reportValidity()')
    expect(editor).toContain('defineExpose({ reportValidity })')
    expect(editor).toContain('[data-testid="description-block-heading-input"]:invalid')
    expect(editor).toContain('firstInvalid.reportValidity()')
    expect(editor).toContain('firstInvalid.focus()')
    expect(editor).toContain('aria-label="Description section title"')
    expect(editor).toContain('aria-required="true"')
    expect(editor).toContain('data-testid="description-block-heading-input"')
    expect(editor).toContain('required')
    expect(editor).toContain(':placeholder="getBlockHeadingPlaceholder(block)"')
    expect(headingInput).toContain('factory-description-heading-input')
    expect(headingInput).toContain('border border-transparent bg-transparent')
    expect(headingInput).toContain('hover:bg-transparent')
    expect(headingInput).toContain('focus:border-brand-500/60')
    expect(headingInput).toContain('focus:ring-2 focus:ring-brand-500/20')
    expect(headingInput).not.toContain('hover:border-surface-200')
    expect(headingInput).not.toContain('dark:hover:border-surface-700')
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
    expect(editor).toContain('<span>Add</span>')
    expect(editor).not.toContain('<span>Add bullet</span>')
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
    expect(editPage).toContain('id="application-description-section"')
    expect(editPage).toContain('title="Description"')
    expect(editPage).toContain('variant="nested"')
    expect(editPage).toContain('content-class="px-0 pb-0 pt-3"')
    expect(editPage).toContain('const descriptionBlocksEditorRef = ref')
    expect(editPage).toContain('descriptionBlocksEditorRef.value && !descriptionBlocksEditorRef.value.reportValidity()')
    expect(editPage).toContain('Add a title for each description section')
    expect(editPage).toContain('ref="descriptionBlocksEditorRef"')
    const headerActionsIndex = editPage.indexOf('data-testid="application-form-header-actions"')
    const previewActionIndex = editPage.indexOf('Preview', headerActionsIndex)
    const saveActionIndex = editPage.indexOf("{{ isSavingPosting ? 'Saving...' : 'Save' }}")
    const formStartIndex = editPage.indexOf('<form class="contents"')
    const collapsibleDescriptions = [
      'Adding salary information improves visibility on Google Jobs.',
      'Set when this job posting goes live and when it automatically expires.',
      'Choose what candidates must provide when applying.',
      'Add voluntary self-identification questions for US equal employment opportunity reporting.',
      'Customize the questions applicants must answer when applying. All applications include name, email, and phone by default.',
      'Create unique tracking links for this job to measure where applications come from.',
    ]

    expect(headerActionsIndex).toBeGreaterThan(-1)
    expect(previewActionIndex).toBeGreaterThan(headerActionsIndex)
    expect(saveActionIndex).toBeGreaterThan(headerActionsIndex)
    expect(saveActionIndex).toBeLessThan(formStartIndex)
    expect(editPage).toContain('Configure the application experience for <strong>{{ job.title }}</strong>')
    expect(editPage).not.toContain('Configure the application experience for <strong>{{ job.title }}</strong>.')
    expect(editPage).not.toContain('Preview form')
    expect(editPage).not.toContain("'Save changes'")
    expect(editPage).not.toContain('Save application details')
    expect(editPage).toContain('data-testid="application-link-panel"')
    expect(editPage).toContain('group group/application-link')
    expect(editPage).toContain('group/application-link')
    expect(editPage).toContain("applicationLinkCopied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'")
    expect(editPage).toContain('group-focus-visible:bg-white')
    expect(editPage).not.toContain('class="mb-6"')
    expect(editPage).not.toContain('<form class="space-y-6"')
    for (const description of collapsibleDescriptions) {
      expect(editPage).toContain(`description="${description}"`)
    }
    expect(editPage).toContain('US_STATE_OPTIONS')
    expect(editPage).toContain('parseJobLocation')
    expect(editPage).toContain('buildJobLocation')
    expect(editPage).toContain('const parsedLocation = parseJobLocation(j.location)')
    expect(editPage).toContain('city: parsedLocation.city')
    expect(editPage).toContain('state: parsedLocation.state')
    expect(editPage).toContain('location: buildJobLocation({ city: form.value.city, state: form.value.state }) || null')
    expect(editPage).toContain('id="application-city"')
    expect(editPage).toContain('v-model="form.city"')
    expect(editPage).toContain('id="application-state"')
    expect(editPage).toContain('v-model="form.state"')
    expect(editPage).toContain(':options="jobStateOptions"')
    expect(editPage).not.toContain('id="application-location"')
    expect(editPage).not.toContain('v-model="form.location"')

    const sectionIcons = [
      ['application-section-basic-details', 'Briefcase'],
      ['application-section-salary', 'CircleDollarSign'],
      ['application-section-schedule', 'CalendarClock'],
      ['application-section-requirements', 'ClipboardCheck'],
      ['application-section-compliance', 'ShieldCheck'],
      ['application-section-questions', 'FileText'],
      ['application-section-tracking', 'Radio'],
    ]

    for (const [sectionId, iconName] of sectionIcons) {
      expect(editPage).toContain(`id="${sectionId}"`)
      const sectionStart = editPage.indexOf(`id="${sectionId}"`)
      const sectionEnd = editPage.indexOf('</DashboardCollapsibleSection>', sectionStart)
      const sectionMarkup = editPage.slice(sectionStart, sectionEnd)
      expect(sectionMarkup).toContain('<template #icon>')
      expect(sectionMarkup).toContain(`<${iconName} class="size-4 text-surface-500 dark:text-surface-400" />`)
    }
    expect(editPage).toContain(':default-open="true"')

    const collapsibleSection = readProjectFile('app/components/DashboardCollapsibleSection.vue')
    expect(collapsibleSection).toContain("variant?: 'panel' | 'nested'")
    expect(collapsibleSection).toContain("variant: 'panel'")
    expect(collapsibleSection).toContain('const isNested = computed(() => props.variant === \'nested\')')
    expect(collapsibleSection).toContain('const sectionClass = computed')
    expect(collapsibleSection).toContain('const headerClass = computed')
    expect(collapsibleSection).toContain('const isOpen = ref(props.defaultOpen)')
    expect(collapsibleSection).toContain('const panelRef = ref<HTMLElement | null>(null)')
    expect(collapsibleSection).toContain("const panelHeight = ref(props.defaultOpen ? 'auto' : '0px')")
    expect(collapsibleSection).toContain("const panelOpacity = ref(props.defaultOpen ? '1' : '0')")
    expect(collapsibleSection).toContain('function toggleSection()')
    expect(collapsibleSection).toContain('function finishPanelTransition')
    expect(collapsibleSection).toContain('@transitionend="finishPanelTransition"')
    expect(collapsibleSection).toContain(':style="{ height: panelHeight, opacity: panelOpacity }"')
    expect(collapsibleSection).toContain('requestAnimationFrame')
    expect(collapsibleSection).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(collapsibleSection).toContain('transition-[height,opacity]')
    expect(collapsibleSection).toContain('motion-reduce:transition-none')
    expect(collapsibleSection).toContain(':inert="!isOpen"')
    expect(collapsibleSection).toContain(':aria-hidden="!isOpen"')
    expect(collapsibleSection).toContain(':aria-expanded="isOpen"')
    expect(collapsibleSection).toContain(':aria-controls="contentId"')
    expect(collapsibleSection).toContain('role="region"')
    expect(collapsibleSection).toContain(":class=\"isOpen ? 'rotate-0' : '-rotate-90'\"")
    expect(collapsibleSection).toContain('group/section-header flex items-start gap-3')
    expect(collapsibleSection).toContain('transition-colors')
    expect(collapsibleSection).not.toContain('hover:bg-surface-50')
    expect(collapsibleSection).not.toContain('dark:hover:bg-surface-900')
    expect(collapsibleSection).toContain('group-hover/section-header:text-surface-')
    expect(collapsibleSection).toContain('ChevronDown')
    expect(collapsibleSection).toContain('Info')
    expect(collapsibleSection).toContain(':title="description"')
    expect(collapsibleSection).toContain(':aria-label="description"')
    expect(collapsibleSection).toContain('class="flex min-w-0 flex-1 items-start gap-2"')
    expect(collapsibleSection).not.toContain('hover:bg-surface-100')
    expect(collapsibleSection).not.toContain('focus-visible:bg-surface-100')
    expect(collapsibleSection).not.toContain('dark:hover:bg-surface-800')
    expect(collapsibleSection).not.toContain('dark:focus-visible:bg-surface-800')
    expect(collapsibleSection).not.toContain('mt-1 block text-xs')

    const sectionStack = readProjectFile('app/components/DashboardSectionStack.vue')
    expect(sectionStack).toContain('class="grid gap-6"')
  })

  it('uses the styled dashboard date picker for application schedule dates', () => {
    const editPage = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(editPage).toContain('<DashboardDatePicker')
    expect(editPage).toContain('id="application-active-from"')
    expect(editPage).toContain('v-model="form.activeFrom"')
    expect(editPage).toContain('id="application-valid-through"')
    expect(editPage).toContain('v-model="form.validThrough"')
    expect(editPage).not.toContain('id="application-active-from"\n                v-model="form.activeFrom"\n                type="date"')
    expect(editPage).not.toContain('id="application-valid-through"\n                  v-model="form.validThrough"\n                  type="date"')

    const datePicker = readProjectFile('app/components/DashboardDatePicker.vue')
    expect(datePicker).toContain('useFloatingMenu')
    expect(datePicker).toContain('width: 320')
    expect(datePicker).toContain('useOutsidePointer')
    expect(datePicker).toContain('aria-haspopup="dialog"')
    expect(datePicker).toContain('role="dialog"')
    expect(datePicker).toContain("data-testid=\"dashboard-date-picker-day\"")
    expect(datePicker).toContain('Calendar')
    expect(datePicker).toContain('ChevronLeft')
    expect(datePicker).toContain('ChevronRight')
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
    expect(editPage).toContain('const applicationSlug = computed(() => form.value.slug.trim() || job.value?.slug || jobId)')
    expect(editPage).toContain('return `${base}/jobs/${applicationSlug.value}/apply`')
    expect(editPage).toContain('const applicationUrlLabel = computed(() => `/jobs/${applicationSlug.value}/apply`)')
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
