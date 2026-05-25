import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)

  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThan(-1)
  expect(end, `missing end marker after ${startMarker}: ${endMarker}`).toBeGreaterThan(start)

  return source.slice(start, end)
}

describe('brand-neutral theme variables', () => {
  it('keeps Factory dark pages on a true black document background', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const baseLayer = css.match(/@layer base \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(baseLayer).toMatch(/html\s*\{[\s\S]*background-color:\s*#000000;/)
    expect(baseLayer).toMatch(/body\s*\{[\s\S]*background-color:\s*#000000;/)
    expect(baseLayer).toMatch(/body\s*\{[\s\S]*color:\s*var\(--color-surface-100\);/)
    expect(baseLayer).toMatch(/\.dark,\s*[\r\n\s]*\.dark body\s*\{[\s\S]*background-color:\s*#000000;/)
    expect(baseLayer).not.toContain('background-color: var(--color-surface-50);')
    expect(baseLayer).not.toContain('background-color: var(--color-surface-950);')
  })

  it('uses neutral CSS custom properties for shared app chrome', () => {
    const css = readProjectFile('app/assets/css/main.css')

    for (const token of [
      '--ui-bg',
      '--ui-panel',
      '--ui-panel-strong',
      '--ui-border',
      '--ui-border-strong',
      '--ui-text',
      '--ui-muted',
      '--ui-faint',
    ]) {
      expect(css).toContain(token)
    }

    expect(css).not.toMatch(/--factory-(bg|panel|panel-strong|border|border-strong|text|muted|faint)\b/)
  })

  it('defines neutral reusable UI recipes for common surfaces', () => {
    const css = readProjectFile('app/assets/css/main.css')

    for (const recipe of [
      '.ui-panel',
      '.ui-panel-muted',
      '.ui-alert',
      '.ui-alert-danger',
      '.ui-alert-success',
      '.ui-alert-warning',
      '.ui-button',
      '.ui-button-primary',
      '.ui-button-secondary',
      '.ui-button-ghost',
      '.ui-button-danger',
      '.ui-button-danger-outline',
      '.ui-button-success',
      '.ui-field',
      '.ui-filter-chip',
      '.ui-filter-chip-active',
      '.ui-filter-chip-inactive',
      '.ui-icon-state',
      '.ui-icon-state-danger',
      '.ui-icon-state-success',
      '.ui-icon-state-brand',
      '.ui-icon-state-warning',
      '.ui-empty-state',
      '.ui-empty-panel',
      '.ui-selectable-panel',
      '.ui-selectable-panel-active',
      '.ui-list-row',
      '.ui-nav-shell',
      '.ui-nav-link',
      '.ui-nav-link-active',
      '.ui-nav-icon',
      '.ui-nav-icon-active',
      '.ui-tab',
      '.ui-tab-active',
      '.ui-tab-inactive',
      '.ui-panel-header',
      '.ui-modal-backdrop',
      '.ui-pill',
      '.ui-pill-brand',
      '.ui-table-shell',
      '.ui-table-header',
      '.ui-table-row',
      '.ui-settings-page',
      '.ui-settings-page-header',
      '.ui-settings-panel',
      '.ui-settings-panel-header',
      '.ui-settings-panel-body',
      '.ui-dashboard-panel',
      '.ui-dashboard-panel-header',
      '.ui-dashboard-stat-card',
      '.ui-icon-tile',
      '.ui-pill-success',
      '.ui-status-dot',
      '.ui-status-dot-brand',
      '.ui-status-dot-success',
      '.ui-status-dot-warning',
      '.ui-status-dot-danger',
      '.ui-code',
      '.ui-inline-link',
      '.ui-inline-link-brand',
      '.ui-inline-link-muted',
      '.ui-feedback-success',
      '.ui-feedback-warning',
      '.ui-icon-success',
      '.ui-icon-brand',
      '.ui-panel-danger',
      '.ui-icon-danger',
    ]) {
      expect(css).toContain(recipe)
    }

    expect(css).toContain('var(--color-surface-')
    expect(css).toContain('var(--color-danger-')
    expect(css).toContain('var(--color-success-')
    expect(css).toContain('var(--color-brand-')
    expect(css).not.toMatch(/\.factory-(panel|alert|field|icon-state)\b/)
  })

  it('keeps filter chips as bordered controls aligned with toolbar fields', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const interviews = readProjectFile('app/pages/dashboard/interviews/index.vue')
    const interviewStatusFilters = sliceBetween(interviews, '<!-- Status pills -->', '<!-- View toggle -->')

    expect(css).toMatch(/\.ui-filter-chip\s*\{[\s\S]*min-height:\s*2\.375rem;[\s\S]*border:\s*1px solid[\s\S]*font-size:\s*0\.75rem;[\s\S]*line-height:\s*1rem;/)
    expect(css).toMatch(/\.ui-filter-chip \.tabular-nums\s*\{[\s\S]*font-size:\s*inherit;[\s\S]*line-height:\s*inherit;/)
    expect(css).toMatch(/\.factory-dashboard-shell,[\s\S]*\.factory-dashboard-portal\)[\s\S]*\.ui-filter-chip\s*\{[\s\S]*min-height:\s*38px;[\s\S]*border:\s*1px solid var\(--ui-border-strong\) !important[\s\S]*font-size:\s*0\.75rem !important;[\s\S]*line-height:\s*1rem !important;/)
    expect(css).toMatch(/\.factory-job-subnav-tab\s*\{[\s\S]*min-height:\s*32px;[\s\S]*border:\s*1px solid var\(--ui-border-strong\) !important/)
    expect(css).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) \.factory-job-status-action\s*\{[\s\S]*height:\s*32px;[\s\S]*font-weight:\s*400 !important/)
    expect(css).toMatch(/\.factory-view-toggle button\s*\{[\s\S]*font-size:\s*0\.75rem !important;[\s\S]*font-weight:\s*400 !important;[\s\S]*text-transform:\s*uppercase !important;/)
    expect(css).toMatch(/\.factory-filter-select\s*\{[\s\S]*text-transform:\s*uppercase !important;/)
    expect(css).toMatch(/\.factory-filter-input,[\s\S]*\.factory-filter-select\s*\{[\s\S]*font-size:\s*0\.75rem !important;[\s\S]*font-weight:\s*400 !important;[\s\S]*letter-spacing:\s*0 !important;/)
    expect(css).toMatch(/\.factory-filter-dropdown-option\s*\{[\s\S]*font-size:\s*0\.75rem !important;[\s\S]*font-weight:\s*400 !important;[\s\S]*letter-spacing:\s*0 !important;/)
    expect(css).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) \.ui-tab\s*\{[\s\S]*min-height:\s*38px;[\s\S]*font-size:\s*0\.75rem !important;[\s\S]*font-weight:\s*400 !important;[\s\S]*text-transform:\s*uppercase !important;/)
    expect(css).toMatch(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) \.ui-tab-active\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--color-brand-500\) 75%, transparent\) !important;[\s\S]*box-shadow:\s*inset 0 -2px 0 var\(--color-brand-500\) !important;/)
    expect(interviewStatusFilters).toContain('ui-filter-chip inline-flex h-[38px]')
    expect(interviewStatusFilters).not.toContain('text-[11px]')
    expect(interviewStatusFilters).not.toContain('tabular-nums text-[10px]')
  })

  it('uses the Factory view toggle recipe on the interviews list controls', () => {
    const interviews = readProjectFile('app/pages/dashboard/interviews/index.vue')
    const viewToggle = sliceBetween(interviews, '<!-- View toggle -->', '<!-- Loading state -->')

    expect(viewToggle).toContain('factory-view-toggle flex h-[38px]')
    expect(viewToggle).toContain(":class=\"{ 'is-active': activeView === 'list' }\"")
    expect(viewToggle).toContain(":class=\"{ 'is-active': activeView === 'calendar' }\"")
    expect(viewToggle).not.toContain('bg-brand-600 text-white')
    expect(viewToggle).not.toContain('style="font-weight')
  })

  it('uses a single segmented border for source tracking date filters', () => {
    for (const path of [
      'app/pages/dashboard/source-tracking/index.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
    ]) {
      const source = readProjectFile(path)
      const dateRangeFilter = sliceBetween(
        source,
        '<!-- Date range pill -->',
        path.endsWith('[id].vue') ? '<!-- Edit -->' : '<!-- Job filter -->',
      )

      expect(dateRangeFilter).toContain('factory-view-toggle inline-flex h-10 overflow-hidden border')
      expect(dateRangeFilter).not.toContain('ui-panel inline-flex')
      expect(dateRangeFilter).not.toContain('ui-filter-chip')
      expect(dateRangeFilter).toContain("first:border-l-0")
      expect(dateRangeFilter).toContain(":class=\"{ 'is-active': dateRange === range }\"")
    }
  })

  it('keeps selectable panels dark inside the dashboard shell', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const applicationForm = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(applicationForm).toContain('ui-selectable-panel')
    expect(css).toMatch(/:where\(\.factory-dashboard-shell,\s*\.factory-dashboard-portal\)\s+\.ui-selectable-panel\s*\{[\s\S]*background-color:\s*#050505 !important;[\s\S]*color:\s*rgb\(255 255 255 \/ 0\.78\) !important;/)
    expect(css).toMatch(/:where\(\.factory-dashboard-shell,\s*\.factory-dashboard-portal\)\s+\.ui-selectable-panel-active\s*\{[\s\S]*background-color:\s*color-mix\(in srgb,\s*var\(--color-brand-500\) 16%,\s*#050505\) !important;/)
  })

  it('explains job status actions with tooltips', () => {
    const actions = readProjectFile('app/components/JobSubNavActions.vue')

    expect(actions).toContain('factory-job-status-action')
    expect(actions).toContain('Publish this job so candidates can apply.')
    expect(actions).toContain(':title="jobTransitionTooltips[primaryJobTransition]')
    expect(actions).toContain(':aria-label="jobTransitionTooltips[primaryJobTransition]')
  })

  it('uses the shared filter chip recipe for job pipeline stage tabs', () => {
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(jobDetail).toContain('ui-filter-chip factory-pipeline-status-chip')
    expect(jobDetail).toContain('ui-filter-chip-active factory-pipeline-status-chip-active')
    expect(jobDetail).toContain('ui-filter-chip-inactive')
    expect(jobDetail).toContain('factory-pipeline-status-chip relative flex h-8 shrink-0 cursor-pointer items-center gap-2 px-3.5 text-xs')
    expect(jobDetail).toContain('factory-pipeline-status-chip-stage tabular-nums')
    expect(jobDetail).toContain('factory-pipeline-status-chip-count tabular-nums text-xs font-normal')
    expect(jobDetail).toContain('style="font-weight: 300 !important"')
    expect(css).toMatch(/\.factory-pipeline-status-chip\s*\{[\s\S]*height:\s*32px !important;[\s\S]*min-height:\s*32px !important;[\s\S]*font-weight:\s*300 !important/)
    expect(css).toMatch(/@media \(max-width: 860px\)[\s\S]*\.factory-pipeline-stage-strip-label,[\s\S]*\.factory-pipeline-status-chip-label[\s\S]*clip:\s*rect\(0, 0, 0, 0\)/)
    expect(css).toMatch(/\.factory-pipeline-status-chip-number\s*\{[\s\S]*min-width:\s*18px;[\s\S]*border:\s*1px solid rgb\(255 255 255 \/ 0\.12\)/)
    expect(css).toMatch(/\.factory-pipeline-status-chip-stage\s*\{[\s\S]*min-width:\s*10px;[\s\S]*font-weight:\s*400/)
    expect(css).toMatch(/\.factory-pipeline-status-chip-active \.factory-pipeline-status-chip-count\s*\{[\s\S]*border-color:/)
    expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.factory-pipeline-status-chip-count\s*\{[\s\S]*display:\s*none;/)
    expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.factory-pipeline-status-chip\s*\{[\s\S]*width:\s*48px;/)
  })

  it('uses the regular brand color for dashboard pipeline screening segments', () => {
    const css = readProjectFile('app/assets/css/main.css')
    const screeningSegment = css.match(/\.factory-pipeline-segment-screening\s*\{[^}]+\}/)?.[0] ?? ''

    expect(screeningSegment).toContain('background-color: var(--color-brand-500) !important')
    expect(screeningSegment).not.toContain('color-mix')
  })

  it('uses an in-app focus mode for the job pipeline instead of native fullscreen', () => {
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(jobDetail).toContain('fixed inset-0 z-50 flex h-screen')
    expect(jobDetail).toContain("event.key === 'Escape' && isFullscreen.value")
    expect(jobDetail).not.toContain('requestFullscreen')
    expect(jobDetail).not.toContain('exitFullscreen')
    expect(jobDetail).not.toContain('fullscreenchange')
  })

  it('adapts shared UI recipes inside the Factory dashboard shell', () => {
    const css = readProjectFile('app/assets/css/main.css')

    for (const recipe of [
      '.ui-panel',
      '.ui-panel-muted',
      '.ui-panel-header',
      '.ui-modal-backdrop',
      '.ui-modal-panel',
      '.ui-alert',
      '.ui-button',
      '.ui-button-secondary',
      '.ui-button-ghost',
      '.ui-button-danger-outline',
      '.ui-field',
      '.ui-icon-state',
      '.ui-empty-state',
      '.ui-empty-panel',
      '.ui-list-row',
      '.ui-nav-shell',
      '.ui-nav-link',
      '.ui-nav-icon',
      '.ui-pill',
      '.ui-table-shell',
      '.ui-settings-panel-body',
      '.ui-dashboard-stat-card',
      '.ui-code',
    ]) {
      expect(css, `${recipe} should have a Factory dashboard scoped rule`).toContain(
        `:where(.factory-dashboard-shell, .factory-dashboard-portal) ${recipe}`,
      )
    }
  })

  it('applies shared UI recipes to invite and response surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/auth/reset-password.vue',
        recipes: ['ui-alert', 'ui-field', 'ui-button-primary'],
      },
      {
        path: 'app/pages/join/[token].vue',
        recipes: ['ui-panel-muted', 'ui-alert-danger', 'ui-icon-state-brand', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/interview/respond.vue',
        recipes: ['ui-panel', 'ui-alert-danger', 'ui-icon-state-danger', 'ui-icon-state-info'],
      },
      {
        path: 'app/components/InterviewEmailModal.vue',
        recipes: [
          'ui-modal-panel',
          'ui-panel-muted',
          'ui-field',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-icon-state-brand',
          'ui-icon-state-success',
        ],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('applies shared UI recipes to onboarding and form surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/onboarding/create-org.vue',
        recipes: [
          'ui-alert-danger',
          'ui-button-primary',
          'ui-empty-state',
          'ui-field',
          'ui-icon-state-success',
          'ui-panel',
          'ui-panel-muted',
          'ui-selectable-panel',
          'ui-selectable-panel-active',
        ],
      },
      {
        path: 'app/components/QuestionForm.vue',
        recipes: ['ui-button-primary', 'ui-button-secondary', 'ui-field', 'ui-panel-muted'],
      },
      {
        path: 'app/components/ConsentBanner.vue',
        recipes: ['ui-button-ghost', 'ui-button-primary'],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('applies shared UI recipes to dashboard table surfaces', () => {
    const recipeUsage = [
      'app/pages/dashboard/applications/index.vue',
      'app/pages/dashboard/candidates/index.vue',
      'app/pages/dashboard/jobs/[id]/candidates.vue',
      'app/pages/dashboard/jobs/index.vue',
      'app/pages/dashboard/ai-analysis.vue',
      'app/pages/dashboard/source-tracking/index.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
    ]

    for (const path of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of ['ui-table-shell', 'ui-table-header', 'ui-table-row']) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('applies shared UI recipes to source tracking surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/source-tracking/index.vue',
        recipes: [
          'ApplicationStatusBadge',
          'getSourceChannelBadgeClass',
          'getSourceChannelDotClass',
          'getSourceChannelLabel',
          'ui-alert-danger',
          'ui-button-danger',
          'ui-button-ghost',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-code',
          'ui-dashboard-panel',
          'ui-dashboard-panel-header',
          'ui-dashboard-soft-icon',
          'ui-dashboard-stat-card',
          'ui-empty-panel',
          'ui-field',
          'factory-view-toggle',
          'ui-list-divider',
          'ui-list-row',
          'ui-meter-fill',
          'ui-meter-track',
          'ui-modal-backdrop',
          'ui-modal-panel',
          'ui-panel',
          'ui-panel-divider',
          'ui-panel-muted',
          'ui-pill',
          'ui-tab',
          'ui-tab-active',
          'ui-tab-inactive',
        ],
      },
      {
        path: 'app/pages/dashboard/source-tracking/[id].vue',
        recipes: [
          'ApplicationStatusBadge',
          'getSourceChannelBadgeClass',
          'getSourceChannelDotClass',
          'getSourceChannelLabel',
          'ui-alert-danger',
          'ui-button-ghost',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-code',
          'ui-dashboard-panel',
          'ui-dashboard-panel-header',
          'ui-dashboard-soft-icon',
          'ui-dashboard-stat-card',
          'ui-empty-panel',
          'ui-field',
          'factory-view-toggle',
          'ui-list-row',
          'ui-meter-fill',
          'ui-meter-track',
          'ui-modal-backdrop',
          'ui-modal-panel',
          'ui-panel',
          'ui-panel-divider',
          'ui-panel-muted',
          'ui-pill',
        ],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('keeps source tracking surface choices behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/pages/dashboard/source-tracking/index.vue',
        patterns: [
          /const channelLabels:/,
          /const channelColors:/,
          /const channelBadgeClasses:/,
          /const statusBadgeClasses:/,
          /rounded-2xl border border-surface-200(?:\/80)? dark:border-surface-800 bg-white dark:bg-surface-900/,
          /group relative rounded-2xl bg-white dark:bg-surface-900/,
          /rounded-2xl border border-danger-200 dark:border-danger-900 bg-danger-50/,
          /inline-flex rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /appearance-none rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /inline-flex items-center gap-1\.5 rounded-xl bg-brand-600/,
          /relative w-full max-w-(?:lg|sm) rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/,
          /absolute inset-0 bg-black\/50/,
          /border-b border-surface-100 dark:border-surface-800/,
          /border-t border-surface-100 dark:border-surface-800/,
          /focus:ring-2 focus:ring-brand-500/,
        ],
      },
      {
        path: 'app/pages/dashboard/source-tracking/[id].vue',
        patterns: [
          /rounded-2xl border border-surface-200(?:\/80)? dark:border-surface-800 bg-white dark:bg-surface-900/,
          /group relative rounded-2xl bg-white dark:bg-surface-900/,
          /rounded-2xl border border-danger-200 dark:border-danger-900 bg-danger-50/,
          /inline-flex rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /inline-flex items-center gap-1\.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/,
          /relative w-full max-w-lg rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/,
          /absolute inset-0 bg-black\/50/,
          /border-b border-surface-100 dark:border-surface-800/,
          /border-t border-surface-100 dark:border-surface-800/,
          /focus:ring-2 focus:ring-brand-500/,
        ],
      },
    ]

    for (const { path, patterns } of disallowedPatternsByFile) {
      const source = readProjectFile(path)

      for (const pattern of patterns) {
        expect(source, `${path} should centralize ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('applies shared UI recipes to dashboard empty states', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/jobs/index.vue',
        recipes: ['ui-empty-panel'],
      },
      {
        path: 'app/pages/dashboard/applications/index.vue',
        recipes: ['ui-empty-panel'],
      },
      {
        path: 'app/pages/dashboard/candidates/index.vue',
        recipes: ['ui-empty-panel'],
      },
      {
        path: 'app/pages/dashboard/jobs/[id]/candidates.vue',
        recipes: ['ui-empty-panel'],
      },
      {
        path: 'app/pages/dashboard/interviews/index.vue',
        recipes: ['ui-empty-panel', 'ui-button-secondary'],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('centralizes dashboard page-level panel and card surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/index.vue',
        recipes: [
          'ui-dashboard-stat-card',
          'ui-dashboard-panel',
          'ui-dashboard-panel-header',
          'ui-empty-panel',
          'ui-alert-danger',
        ],
      },
      {
        path: 'app/pages/dashboard/timeline.vue',
        recipes: [
          'ui-dashboard-panel',
          'ui-dashboard-panel-header',
          'ui-empty-panel',
          'GooeySearchInput',
          'ui-alert-danger',
        ],
      },
      {
        path: 'app/pages/dashboard/source-tracking/index.vue',
        recipes: [
          'ui-dashboard-stat-card',
          'ui-dashboard-panel',
          'ui-dashboard-panel-header',
          'ui-empty-panel',
          'ui-field',
          'ui-button-primary',
          'ui-alert-danger',
        ],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }

      expect(source, `${path} should not hand-roll dashboard panel shells`).not.toMatch(
        /rounded-(?:2xl|3xl)\s+border\s+border-surface-200(?:\/80)?\s+dark:border-surface-800\s+bg-white\s+dark:bg-surface-900/,
      )
    }
  })

  it('applies shared UI recipes to settings surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/index.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-field', 'ui-alert-danger', 'ui-button-primary', 'ui-button-danger', 'ui-button-danger-outline', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-field', 'ui-button-primary'],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-panel-muted'],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-panel-muted', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-panel-muted', 'ui-empty-panel', 'ui-field', 'ui-button-primary', 'ui-button-secondary', 'ui-button-danger-outline'],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('applies shared UI recipes to member management surfaces', () => {
    const source = readProjectFile('app/pages/dashboard/settings/members.vue')

    for (const recipe of [
      'ui-settings-page',
      'ui-settings-page-header',
      'ui-settings-panel',
      'ui-settings-panel-header',
      'ui-settings-panel-body',
      'ui-list-row',
      'ui-field',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-danger-outline',
      'ui-button',
      'ui-empty-state',
      'ui-modal-panel',
      'ui-icon-state-brand',
      'ui-icon-state-danger',
      'ui-icon-state-warning',
    ]) {
      expect(source, `members settings should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to AI settings surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/ai/index.vue',
        recipes: ['ui-panel', 'ui-empty-panel', 'ui-alert-warning', 'ui-button-primary', 'ui-button-secondary', 'ui-button-danger-outline'],
      },
      {
        path: 'app/pages/dashboard/settings/ai/new.vue',
        recipes: ['ui-alert-warning'],
      },
      {
        path: 'app/pages/dashboard/settings/ai/[id].vue',
        recipes: ['ui-alert-warning', 'ui-alert-danger', 'ui-button-danger'],
      },
      {
        path: 'app/components/AiConfigForm.vue',
        recipes: ['ui-panel', 'ui-field', 'ui-selectable-panel', 'ui-alert-info', 'ui-button-primary', 'ui-button-secondary'],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('applies shared UI recipes to settings navigation surfaces', () => {
    const recipeUsage = [
      'app/components/SettingsSidebar.vue',
      'app/components/SettingsMobileNav.vue',
    ]

    for (const path of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of ['ui-nav-shell', 'ui-nav-link', 'ui-nav-link-active']) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }

    const sidebar = readProjectFile('app/components/SettingsSidebar.vue')

    for (const recipe of ['ui-nav-icon', 'ui-nav-icon-active']) {
      expect(sidebar, `SettingsSidebar should use ${recipe}`).toContain(recipe)
    }
  })

  it('does not pass layout visibility classes through fragment-root app chrome components', () => {
    const settingsLayout = readProjectFile('app/layouts/settings.vue')

    expect(settingsLayout).not.toMatch(/<AppTopBar\s+class=/)
    expect(settingsLayout).not.toMatch(/<div\s+class="hidden lg:block">\s*<AppTopBar\s*\/>\s*<\/div>/)
    expect(settingsLayout).toMatch(/<AppTopBar\s*\/>/)
    expect(settingsLayout).toContain('flex h-screen flex-col overflow-hidden')
    expect(settingsLayout).toContain('flex min-h-0 flex-1 flex-col lg:flex-row min-w-0')
    expect(settingsLayout).toContain('factory-layout-main flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto')
  })

  it('applies shared UI recipes to interview list and template surfaces', () => {
    const interviewList = readProjectFile('app/pages/dashboard/interviews/index.vue')

    for (const recipe of [
      'getInterviewStatusBadgeClass',
      'getInterviewStatusDotClass',
      'getInterviewStatusLabel',
      'getInterviewTransitionButtonClass',
      'getInterviewTransitionLabel',
      'ui-alert-danger',
      'ui-button-danger',
      'ui-button-ghost',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-empty-panel',
      'ui-field',
      'ui-feedback-danger',
      'ui-filter-chip',
      'ui-filter-chip-active',
      'ui-filter-chip-inactive',
      'ui-floating-menu',
      'ui-icon-state',
      'ui-icon-tile',
      'ui-inline-link-brand',
      'ui-list-row',
      'ui-menu-action',
      'ui-menu-action-danger',
      'ui-menu-divider',
      'ui-modal-backdrop',
      'ui-modal-panel',
      'ui-panel',
      'ui-pill',
      'ui-status-dot',
    ]) {
      expect(interviewList, `interview list should use ${recipe}`).toContain(recipe)
    }

    const statusDisplay = readProjectFile('app/utils/status-display.ts')
    expect(statusDisplay, 'interview transition helpers should centralize success actions').toContain('ui-button-success')

    const recipeUsage = [
      {
        path: 'app/pages/dashboard/interviews/templates/index.vue',
        recipes: [
          'ui-button-danger',
          'ui-button-ghost',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-empty-panel',
          'ui-empty-panel-dashed',
          'ui-icon-state',
          'ui-icon-tile',
          'ui-list-row',
          'ui-modal-backdrop',
          'ui-modal-panel',
          'ui-panel',
          'ui-panel-brand',
          'ui-pill',
          'ui-spinner-brand',
        ],
      },
      {
        path: 'app/pages/dashboard/interviews/templates/new.vue',
        recipes: [
          'ui-button-ghost',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-code',
          'ui-field',
          'ui-icon-state',
          'ui-icon-tile',
          'ui-panel',
          'ui-panel-brand',
          'ui-panel-brand-header',
          'ui-panel-divider',
          'ui-panel-muted',
        ],
      },
      {
        path: 'app/pages/dashboard/interviews/templates/[id].vue',
        recipes: [
          'ui-button-danger',
          'ui-button-ghost',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-code',
          'ui-field',
          'ui-icon-state',
          'ui-icon-tile',
          'ui-inline-link-brand',
          'ui-panel',
          'ui-panel-brand',
          'ui-panel-brand-header',
          'ui-panel-danger',
          'ui-panel-divider',
          'ui-panel-muted',
          'ui-pill',
          'ui-spinner-brand',
        ],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('keeps interview list and template surface choices behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/pages/dashboard/interviews/index.vue',
        patterns: [
          /const statusConfig:/,
          /class: 'bg-brand-50 text-brand-700 ring-brand-200/,
          /w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /inline-flex items-center gap-2 rounded-lg bg-brand-600/,
          /inline-flex items-center gap-1\.5 rounded-full px-3 py-1\.5 text-xs font-medium/,
          /flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden/,
          /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /rounded-lg border border-danger-200 dark:border-danger-900 bg-danger-50 dark:bg-danger-950/,
          /rounded-lg bg-success-600/,
          /absolute right-0 top-full mt-1\.5 z-50 w-48 rounded-xl border border-surface-200/,
          /border-t border-surface-100 dark:border-surface-800/,
          /absolute inset-0 bg-black\/40 backdrop-blur-sm/,
          /relative bg-white dark:bg-surface-900 rounded-2xl/,
          /focus:ring-brand-500/,
          /bg-emerald-/,
          /text-emerald-/,
        ],
      },
      {
        path: 'app/pages/dashboard/interviews/templates/index.vue',
        patterns: [
          /inline-flex items-center gap-1 rounded-full border border-surface-200/,
          /flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/,
          /inline-flex items-center gap-1\.5 rounded-xl bg-brand-600/,
          /group relative rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /inline-flex items-center gap-1 rounded-md bg-surface-100 dark:bg-surface-800/,
          /rounded-xl border-2 border-dashed border-surface-200/,
          /absolute inset-0 bg-black\/30 backdrop-blur/,
          /relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl bg-white/,
          /cursor-pointer rounded-lg p-2 text-surface-400 hover:text-danger-600/,
          /border-2 border-brand-200 border-t-brand-600/,
        ],
      },
      {
        path: 'app/pages/dashboard/interviews/templates/new.vue',
        patterns: [
          /inline-flex items-center gap-1 rounded-full border border-surface-200/,
          /flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/,
          /cursor-pointer inline-flex items-center gap-1\.5 rounded-xl border border-surface-200/,
          /cursor-pointer inline-flex items-center gap-1\.5 rounded-xl bg-brand-600/,
          /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /w-full rounded-lg border border-surface-200 dark:border-surface-700/,
          /rounded-xl border border-brand-200 dark:border-brand-800\/60 bg-white/,
          /border-b border-brand-100 dark:border-brand-900\/40 bg-brand-50\/50/,
          /focus:ring-brand-500/,
        ],
      },
      {
        path: 'app/pages/dashboard/interviews/templates/[id].vue',
        patterns: [
          /inline-flex items-center gap-1 rounded-full border border-surface-200/,
          /inline-flex items-center gap-1\.5 rounded-lg bg-brand-600/,
          /cursor-pointer inline-flex items-center gap-1\.5 rounded-xl border border-surface-200/,
          /cursor-pointer inline-flex items-center gap-1\.5 rounded-xl bg-brand-600/,
          /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
          /w-full rounded-lg border border-surface-200 dark:border-surface-700/,
          /rounded-xl border border-danger-200\/60/,
          /cursor-pointer inline-flex items-center gap-1\.5 rounded-lg bg-danger-600/,
          /rounded-xl border border-brand-200 dark:border-brand-800\/60 bg-white/,
          /border-b border-brand-100 dark:border-brand-900\/40 bg-brand-50\/50/,
          /border-2 border-brand-200 border-t-brand-600/,
          /focus:ring-brand-500/,
        ],
      },
    ]

    for (const { path, patterns } of disallowedPatternsByFile) {
      const source = readProjectFile(path)

      for (const pattern of patterns) {
        expect(source, `${path} should centralize ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('keeps remaining detail surfaces behind shared modal and drawer recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/components/ApplicationDetailDrawer.vue',
        patterns: [/fixed inset-0 z-\[55\] bg-black\/75/],
      },
      {
        path: 'app/components/CandidateDetailDrawer.vue',
        patterns: [/fixed inset-0 z-\[55\] bg-black\/75/],
      },
      {
        path: 'app/components/InterviewScheduleSidebar.vue',
        patterns: [/absolute inset-0 bg-black\/50/],
      },
      {
        path: 'app/pages/dashboard/interviews/[id].vue',
        patterns: [
          /absolute inset-0 bg-black\/40/,
          /relative bg-white dark:bg-surface-900 rounded-2xl/,
          /const statusConfig:/,
          /const transitionClasses:/,
        ],
      },
    ]

    for (const { path, patterns } of disallowedPatternsByFile) {
      const source = readProjectFile(path)

      for (const pattern of patterns) {
        expect(source, `${path} should centralize ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('does not leave native selects in internal Factory dashboard controls', () => {
    const internalSelectFiles = [
      'app/components/AiConfigForm.vue',
      'app/components/CandidateDetailSidebar.vue',
      'app/components/PropertyFilterBar.vue',
      'app/components/PropertySchemaEditor.vue',
      'app/components/QuestionForm.vue',
      'app/components/ScoreBreakdown.vue',
      'app/pages/dashboard/settings/members.vue',
    ]

    for (const path of internalSelectFiles) {
      const source = readProjectFile(path)
      expect(source, `${path} should use FactorySelect instead of native select`).not.toContain('<select')
    }
  })

  it('keeps FactorySelect labels associated with the interactive control', () => {
    const source = readProjectFile('app/components/FactorySelect.vue')

    expect(source).toMatch(/defineOptions\(\{\s*inheritAttrs:\s*false,\s*\}\)/)
    expect(source).toContain('const selectId = computed(() => props.id ?? generatedSelectId)')
    expect(source).toMatch(/<button[\s\S]*:id="selectId"/)
  })

  it('keeps remaining dashboard display helpers centralized', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/pages/dashboard/index.vue',
        patterns: [/const statusBadgeClasses:/],
      },
      {
        path: 'app/pages/dashboard/jobs/index.vue',
        patterns: [/const statusBadgeClasses:/],
      },
      {
        path: 'app/pages/dashboard/jobs/[id]/index.vue',
        patterns: [
          /const statusBadgeClasses:/,
          /const transitionClasses:/,
          /function getTimelineStatusBadge/,
          /const interviewStatusClasses:/,
          /const jobStatusBadgeClasses:/,
          /'bg-success-50[^']+': app\.score >= 75/,
          /'bg-success-50[^']+': currentSummary\.score >= 75/,
          /function timeAgo/,
          /function scoreClass/,
        ],
      },
      {
        path: 'app/pages/dashboard/chatbot/[[id]].vue',
        patterns: [/function formatBytes/],
      },
      {
        path: 'app/pages/dashboard/jobs/[id]/candidates.vue',
        patterns: [/function timeAgo/],
      },
      {
        path: 'app/pages/dashboard/applications/index.vue',
        patterns: [/function timeAgo/],
      },
      {
        path: 'app/components/CandidateDetailDrawer.vue',
        patterns: [/function formatFileSize/],
      },
      {
        path: 'app/pages/dashboard/candidates/[id].vue',
        patterns: [/function formatFileSize/],
      },
      {
        path: 'app/components/DynamicField.vue',
        patterns: [/function formatFileSize/],
      },
    ]

    for (const { path, patterns } of disallowedPatternsByFile) {
      const source = readProjectFile(path)

      for (const pattern of patterns) {
        expect(source, `${path} should centralize ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})
