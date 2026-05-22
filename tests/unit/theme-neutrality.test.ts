import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('brand-neutral theme variables', () => {
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
      '.ui-panel-brand',
      '.ui-panel-brand-header',
      '.ui-panel-danger',
      '.ui-panel-footer',
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
      '.ui-button-ghost-danger',
      '.ui-button-success',
      '.ui-field',
      '.ui-field-invalid',
      '.ui-checkbox',
      '.ui-checkbox-brand',
      '.ui-checkbox-warning',
      '.ui-icon-state',
      '.ui-icon-state-danger',
      '.ui-icon-state-success',
      '.ui-icon-state-brand',
      '.ui-icon-state-warning',
      '.ui-icon-tile',
      '.ui-empty-state',
      '.ui-empty-panel',
      '.ui-empty-panel-dashed',
      '.ui-selectable-panel',
      '.ui-selectable-panel-active',
      '.ui-list-row',
      '.ui-nav-shell',
      '.ui-nav-link',
      '.ui-nav-link-active',
      '.ui-nav-icon',
      '.ui-nav-icon-active',
      '.ui-nav-description',
      '.ui-nav-description-active',
      '.ui-panel-header',
      '.ui-pill',
      '.ui-pill-brand',
      '.ui-pill-success',
      '.ui-pill-warning',
      '.ui-pill-danger',
      '.ui-pill-info',
      '.ui-status-dot',
      '.ui-status-dot-brand',
      '.ui-status-dot-success',
      '.ui-status-dot-warning',
      '.ui-status-dot-danger',
      '.ui-code',
      '.ui-step-marker',
      '.ui-meter-track',
      '.ui-meter-fill',
      '.ui-meter-fill-danger',
      '.ui-meter-fill-warning',
      '.ui-meter-fill-brand',
      '.ui-meter-fill-success',
      '.ui-meter-label-danger',
      '.ui-meter-label-brand',
      '.ui-meter-label-success',
      '.ui-portal-panel',
      '.ui-portal-header',
      '.ui-portal-body',
      '.ui-portal-card',
      '.ui-portal-pill',
      '.ui-portal-action',
      '.ui-portal-field',
      '.ui-portal-empty-action',
      '.ui-portal-alert-danger',
      '.ui-portal-divider',
      '.ui-portal-link',
      '.ui-drawer-panel',
      '.ui-drawer-header',
      '.ui-drawer-tabs',
      '.ui-drawer-body',
      '.ui-tab',
      '.ui-tab-active',
      '.ui-tab-inactive',
      '.ui-action-bar',
      '.ui-avatar',
      '.ui-avatar-brand',
      '.ui-feedback-success',
      '.ui-feedback-danger',
      '.ui-feedback-warning',
      '.ui-field-addon',
      '.ui-field-icon',
      '.ui-icon-brand',
      '.ui-icon-success',
      '.ui-icon-danger',
      '.ui-icon-warning',
      '.ui-inline-link',
      '.ui-inline-link-brand',
      '.ui-inline-link-muted',
      '.ui-list-divider',
      '.ui-menu-action',
      '.ui-menu-action-active',
      '.ui-menu-action-danger',
      '.ui-menu-trigger',
      '.ui-menu-trigger-active',
      '.ui-checkbox-indicator',
      '.ui-checkbox-indicator-checked',
      '.ui-inline-edit-trigger',
      '.ui-inline-edit-trigger-active',
      '.ui-required-marker',
      '.ui-disclosure-trigger',
      '.ui-table-shell',
      '.ui-table-header',
      '.ui-table-row',
      '.ui-dashboard-stat-card',
      '.ui-dashboard-stat-card-brand',
      '.ui-dashboard-stat-card-violet',
      '.ui-dashboard-stat-card-teal',
      '.ui-dashboard-stat-card-warning',
      '.ui-dashboard-panel',
      '.ui-dashboard-panel-header',
      '.ui-dashboard-soft-icon',
      '.ui-filter-chip',
      '.ui-filter-chip-active',
      '.ui-filter-chip-inactive',
      '.ui-timeline-line',
      '.ui-timeline-date-highlight',
      '.ui-timeline-section',
      '.ui-timeline-section-header',
      '.ui-update-version-badge',
      '.ui-update-card',
      '.ui-update-card-expanded',
      '.ui-update-card-collapsed',
      '.ui-command-block',
    ]) {
      expect(css).toContain(recipe)
    }

    expect(css).toContain('var(--color-surface-')
    expect(css).toContain('var(--color-danger-')
    expect(css).toContain('var(--color-success-')
    expect(css).toContain('var(--color-brand-')
    expect(css).not.toMatch(/\.factory-(panel|alert|field|icon-state)\b/)
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
          'ui-alert-danger',
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
          'ui-alert-success',
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
          'getApplicationStatusBadgeClass',
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
          'ui-filter-chip',
          'ui-filter-chip-active',
          'ui-filter-chip-inactive',
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
          'getApplicationStatusBadgeClass',
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
          'ui-filter-chip',
          'ui-filter-chip-active',
          'ui-filter-chip-inactive',
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

  it('applies shared UI recipes to dashboard home panels and cards', () => {
    const source = readProjectFile('app/pages/dashboard/index.vue')

    for (const recipe of [
      'ui-dashboard-stat-card',
      'ui-dashboard-stat-card-brand',
      'ui-dashboard-stat-card-violet',
      'ui-dashboard-stat-card-teal',
      'ui-dashboard-stat-card-warning',
      'ui-dashboard-panel',
      'ui-dashboard-panel-header',
      'ui-dashboard-soft-icon',
      'ui-empty-panel',
      'ui-alert-danger',
      'ui-button-primary',
      'ui-list-divider',
      'ui-list-row',
      'ui-pill',
      'ui-pill-brand',
      'ui-inline-link-brand',
      'getApplicationStatusBadgeClass',
    ]) {
      expect(source, `dashboard home should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to timeline and updates page-level surfaces', () => {
    const timeline = readProjectFile('app/pages/dashboard/timeline.vue')
    const updates = readProjectFile('app/pages/dashboard/updates.vue')

    for (const recipe of [
      'ui-field',
      'ui-filter-chip',
      'ui-filter-chip-active',
      'ui-filter-chip-inactive',
      'ui-alert-danger',
      'ui-empty-panel',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-ghost',
      'ui-timeline-line',
      'ui-timeline-date-highlight',
      'ui-timeline-section',
      'ui-timeline-section-header',
      'ui-list-divider',
      'ui-list-row',
      'ui-inline-link-brand',
      'getApplicationStatusBadgeClass',
    ]) {
      expect(timeline, `timeline should use ${recipe}`).toContain(recipe)
    }

    for (const recipe of [
      'ui-update-version-badge',
      'ui-dashboard-panel',
      'ui-dashboard-panel-header',
      'ui-dashboard-soft-icon',
      'ui-panel-brand',
      'ui-panel-brand-header',
      'ui-panel-muted',
      'ui-alert-success',
      'ui-alert-danger',
      'ui-alert-warning',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-ghost',
      'ui-empty-panel',
      'ui-update-card',
      'ui-update-card-expanded',
      'ui-update-card-collapsed',
      'ui-command-block',
      'ui-inline-link-brand',
    ]) {
      expect(updates, `updates should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to job settings surfaces', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')

    for (const recipe of [
      'ui-panel',
      'ui-panel-brand',
      'ui-panel-danger',
      'ui-panel-muted',
      'ui-alert-danger',
      'ui-field',
      'ui-field-invalid',
      'ui-checkbox',
      'ui-checkbox-brand',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-danger-outline',
      'ui-button-ghost-danger',
      'ui-feedback-danger',
      'ui-icon-brand',
      'ui-inline-link-brand',
      'ui-required-marker',
    ]) {
      expect(source, `job settings should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to settings surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/index.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-field', 'ui-field-control', 'ui-field-addon', 'ui-feedback-success', 'ui-feedback-danger', 'ui-alert-danger', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-field', 'ui-field-icon-button', 'ui-alert-danger', 'ui-button-primary', 'ui-meter-track', 'ui-meter-fill', 'ui-meter-label-danger', 'ui-meter-label-warning', 'ui-meter-label-brand', 'ui-meter-label-success', 'ui-avatar', 'ui-avatar-brand', 'ui-feedback-success', 'ui-feedback-danger', 'ui-inline-link'],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-panel-muted', 'ui-selectable-panel', 'ui-radio-brand', 'ui-alert-danger', 'ui-button-primary'],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-panel-muted', 'ui-alert-danger', 'ui-alert-success', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary', 'ui-pill-success', 'ui-status-dot-success', 'ui-code', 'ui-icon-brand', 'ui-icon-success', 'ui-inline-link-brand', 'ui-inline-link-muted', 'ui-feedback-success', 'ui-feedback-warning'],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        recipes: ['ui-panel', 'ui-panel-muted', 'ui-panel-divider', 'ui-empty-panel', 'ui-field', 'ui-alert-danger', 'ui-alert-success', 'ui-button-primary', 'ui-button-secondary', 'ui-button-danger-outline', 'ui-button-ghost-danger', 'ui-pill-warning', 'ui-pill-success', 'ui-code', 'ui-step-marker', 'ui-required-marker', 'ui-icon-success', 'ui-inline-link-brand'],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('applies shared UI recipes to AI settings surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/ai/index.vue',
        recipes: [
          'ui-alert-warning',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-button-danger-outline',
          'ui-empty-panel',
          'ui-feedback-success',
          'ui-feedback-danger',
          'ui-icon-state-brand',
          'ui-panel',
          'ui-pill',
          'ui-pill-brand',
          'ui-pill-warning',
          'ui-pill-danger',
        ],
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
        recipes: [
          'ui-action-bar',
          'ui-alert-info',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-checkbox',
          'ui-checkbox-brand',
          'ui-checkbox-warning',
          'ui-disclosure-trigger',
          'ui-feedback-success',
          'ui-feedback-danger',
          'ui-field',
          'ui-field-icon-button',
          'ui-icon-brand',
          'ui-icon-state-brand',
          'ui-icon-warning',
          'ui-inline-link',
          'ui-inline-link-brand',
          'ui-panel',
          'ui-panel-header',
          'ui-pill',
          'ui-pill-brand',
          'ui-pill-info',
          'ui-pill-success',
          'ui-selectable-panel',
          'ui-selectable-panel-active',
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

  it('applies shared UI recipes to member management surfaces', () => {
    const source = readProjectFile('app/pages/dashboard/settings/members.vue')

    for (const recipe of [
      'ui-panel',
      'ui-panel-header',
      'ui-list-row',
      'ui-field',
      'ui-field-icon',
      'ui-alert-danger',
      'ui-alert-success',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-danger-outline',
      'ui-button',
      'ui-empty-state',
      'ui-floating-menu',
      'ui-menu-action',
      'ui-menu-action-danger',
      'ui-menu-divider',
      'ui-modal-panel',
      'ui-modal-backdrop',
      'ui-panel-divider',
      'ui-panel-subsection',
      'ui-pill',
      'ui-pill-brand',
      'ui-pill-warning',
      'ui-avatar',
      'ui-avatar-brand',
      'ui-feedback-success',
      'ui-feedback-danger',
      'ui-icon-state-brand',
      'ui-icon-state-danger',
      'ui-icon-state-warning',
      'ui-icon-brand',
      'ui-icon-danger',
      'ui-inline-link',
      'ui-list-divider',
    ]) {
      expect(source, `members settings should use ${recipe}`).toContain(recipe)
    }
  })

  it('keeps Settings and member surface choices behind shared recipes', () => {
    const paths = [
      'app/layouts/settings.vue',
      'app/components/AiConfigForm.vue',
      'app/components/SettingsMobileNav.vue',
      'app/pages/dashboard/settings/index.vue',
      'app/pages/dashboard/settings/account.vue',
      'app/pages/dashboard/settings/localization.vue',
      'app/pages/dashboard/settings/integrations.vue',
      'app/pages/dashboard/settings/sso.vue',
      'app/pages/dashboard/settings/members.vue',
      'app/pages/dashboard/settings/ai/index.vue',
      'app/pages/dashboard/settings/ai/new.vue',
      'app/pages/dashboard/settings/ai/[id].vue',
    ]
    const disallowedPatterns = [
      /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
      /rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950/,
      /rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50\/50 dark:bg-brand-950\/30/,
      /w-full rounded-lg border(?: border-surface-300 dark:border-surface-700)? px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800/,
      /size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500/,
      /inline-flex(?: cursor-pointer)? items-center gap-[\w.[\]-]+ rounded-lg bg-brand-600/,
      /inline-flex(?: cursor-pointer)? items-center gap-[\w.[\]-]+ rounded-lg bg-danger-600/,
      /focus:ring-brand-500/,
      /text-brand-600 dark:text-brand-400/,
      /text-danger-500/,
    ]

    for (const path of paths) {
      const source = readProjectFile(path)

      for (const pattern of disallowedPatterns) {
        expect(source, `${path} should not keep inline theme pattern ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('applies shared UI recipes to interview detail surfaces', () => {
    const source = readProjectFile('app/pages/dashboard/interviews/[id].vue')

    for (const recipe of [
      'ui-panel',
      'ui-panel-brand',
      'ui-panel-brand-header',
      'ui-panel-danger',
      'ui-panel-footer',
      'ui-panel-muted',
      'ui-modal-panel',
      'ui-alert-danger',
      'ui-field',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-success',
      'ui-button-ghost',
      'ui-button-ghost-danger',
      'ui-selectable-panel',
      'ui-selectable-panel-active',
      'ui-pill',
      'ui-pill-brand',
      'ui-pill-success',
      'ui-pill-danger',
      'ui-status-dot-brand',
      'ui-status-dot-success',
      'ui-status-dot-danger',
      'ui-icon-state-brand',
      'ui-icon-state-success',
      'ui-inline-link-brand',
      'ui-feedback-success',
      'ui-feedback-danger',
      'ui-required-marker',
    ]) {
      expect(source, `interview detail should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to modal form surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/components/ApplyCandidateModal.vue',
        recipes: [
          'ui-modal-panel',
          'ui-panel-header',
          'ui-field',
          'ui-alert-danger',
          'ui-button-ghost',
          'ui-list-row',
          'ui-inline-link-brand',
        ],
      },
      {
        path: 'app/components/FeedbackModal.vue',
        recipes: [
          'ui-modal-panel',
          'ui-panel-header',
          'ui-panel-footer',
          'ui-alert-info',
          'ui-alert-danger',
          'ui-field',
          'ui-checkbox',
          'ui-checkbox-brand',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-button-ghost',
          'ui-selectable-panel',
          'ui-selectable-panel-active',
          'ui-panel-muted',
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

  it('applies shared UI recipes to specialized menu and filter controls', () => {
    const recipeUsage = [
      {
        path: 'app/components/SavedViewsMenu.vue',
        recipes: [
          'ui-menu-trigger',
          'ui-menu-trigger-active',
          'ui-floating-menu',
          'ui-menu-action',
          'ui-menu-action-active',
          'ui-menu-divider',
          'ui-field',
          'ui-button-primary',
          'ui-button-ghost',
          'ui-status-dot-warning',
        ],
      },
      {
        path: 'app/components/ColumnsMenu.vue',
        recipes: [
          'ui-menu-trigger',
          'ui-menu-trigger-active',
          'ui-floating-menu',
          'ui-menu-action',
          'ui-menu-divider',
          'ui-checkbox-indicator',
          'ui-checkbox-indicator-checked',
        ],
      },
      {
        path: 'app/components/OrgSwitcher.vue',
        recipes: [
          'ui-menu-trigger',
          'ui-floating-menu',
          'ui-menu-action',
          'ui-menu-action-active',
          'ui-menu-divider',
        ],
      },
      {
        path: 'app/components/PropertyFilterBar.vue',
        recipes: [
          'ui-filter-chip',
          'ui-filter-chip-active',
          'ui-filter-chip-inactive',
          'ui-floating-menu',
          'ui-menu-action',
          'ui-menu-divider',
          'ui-field',
          'ui-button-secondary',
        ],
      },
      {
        path: 'app/components/PropertyValueEditor.vue',
        recipes: [
          'ui-checkbox-indicator',
          'ui-checkbox-indicator-checked',
          'ui-inline-edit-trigger',
          'ui-inline-edit-trigger-active',
          'ui-floating-menu',
          'ui-menu-action',
          'ui-menu-divider',
          'ui-field',
          'ui-button-primary',
          'ui-button-ghost',
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

  it('applies shared UI recipes to application drawer portal surfaces', () => {
    const source = readProjectFile('app/components/ApplicationDetailDrawer.vue')

    for (const recipe of [
      'ui-portal-panel',
      'ui-portal-header',
      'ui-portal-body',
      'ui-portal-card',
      'ui-portal-pill',
      'ui-portal-action',
      'ui-portal-field',
      'ui-portal-empty-action',
      'ui-portal-alert-danger',
      'ui-portal-divider',
      'ui-portal-link',
    ]) {
      expect(source, `application drawer should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to candidate drawer surfaces', () => {
    const source = readProjectFile('app/components/CandidateDetailSidebar.vue')

    for (const recipe of [
      'ui-drawer-panel',
      'ui-drawer-header',
      'ui-drawer-tabs',
      'ui-drawer-body',
      'ui-tab',
      'ui-tab-active',
      'ui-tab-inactive',
      'ui-panel',
      'ui-empty-panel',
      'ui-modal-panel',
      'ui-alert-danger',
      'ui-field',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-ghost',
      'ui-avatar',
      'ui-avatar-brand',
      'ui-icon-state-brand',
      'ui-icon-state-info',
      'ui-icon-state-warning',
      'ui-icon-state-success',
      'ui-inline-link-brand',
      'getApplicationStatusBadgeClass',
      'getApplicationTransitionButtonClass',
      'getApplicationTransitionLabel',
    ]) {
      expect(source, `candidate drawer should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to interview scheduling sidebar surfaces', () => {
    const source = readProjectFile('app/components/InterviewScheduleSidebar.vue')

    for (const recipe of [
      'ui-drawer-panel',
      'ui-drawer-header',
      'ui-drawer-body',
      'ui-panel',
      'ui-panel-footer',
      'ui-alert-danger',
      'ui-field',
      'ui-checkbox',
      'ui-checkbox-brand',
      'ui-selectable-panel',
      'ui-selectable-panel-active',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-ghost',
      'ui-icon-state-brand',
      'ui-icon-state-success',
      'ui-pill-brand',
      'ui-pill-success',
      'ui-inline-link',
    ]) {
      expect(source, `interview schedule sidebar should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to AI settings surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/ai/index.vue',
        recipes: ['ui-panel', 'ui-empty-panel', 'ui-alert-warning', 'ui-button-primary', 'ui-button-secondary', 'ui-button-danger-outline', 'ui-pill', 'ui-pill-brand', 'ui-pill-warning', 'ui-pill-danger', 'ui-feedback-success', 'ui-feedback-danger'],
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
        recipes: ['ui-panel', 'ui-field', 'ui-field-icon-button', 'ui-checkbox', 'ui-selectable-panel', 'ui-alert-info', 'ui-button-primary', 'ui-button-secondary', 'ui-pill-info', 'ui-pill-success', 'ui-action-bar', 'ui-feedback-success', 'ui-feedback-danger', 'ui-icon-brand', 'ui-icon-warning', 'ui-inline-link-brand', 'ui-disclosure-trigger'],
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

    for (const recipe of ['ui-nav-shell-side', 'ui-nav-icon', 'ui-nav-icon-active', 'ui-nav-description', 'ui-nav-description-active', 'ui-pill-warning', 'ui-inline-link']) {
      expect(sidebar, `SettingsSidebar should use ${recipe}`).toContain(recipe)
    }

    const mobileNav = readProjectFile('app/components/SettingsMobileNav.vue')
    expect(mobileNav, 'SettingsMobileNav should use ui-nav-shell-top').toContain('ui-nav-shell-top')
  })

  it('applies shared UI recipes to settings layout surfaces', () => {
    const source = readProjectFile('app/layouts/settings.vue')

    for (const recipe of ['factory-dashboard-shell', 'ui-demo-banner', 'ui-demo-link']) {
      expect(source, `settings layout should use ${recipe}`).toContain(recipe)
    }
  })

  it('applies shared UI recipes to the settings route boundary', () => {
    const source = readProjectFile('app/pages/dashboard/settings.vue')

    for (const recipe of ['ui-panel', 'ui-panel-danger', 'ui-icon-danger', 'ui-button', 'ui-button-primary']) {
      expect(source, `settings route boundary should use ${recipe}`).toContain(recipe)
    }
  })

  it('adapts neutral UI recipes inside the Factory dashboard shell', () => {
    const css = readProjectFile('app/assets/css/main.css')

    for (const recipe of [
      '.ui-panel',
      '.ui-panel-brand',
      '.ui-panel-danger',
      '.ui-panel-muted',
      '.ui-panel-header',
      '.ui-panel-footer',
      '.ui-field',
      '.ui-button-secondary',
      '.ui-selectable-panel',
      '.ui-empty-panel',
      '.ui-modal-panel',
      '.ui-floating-menu',
      '.ui-nav-shell',
    ]) {
      expect(css, `Factory shell should adapt ${recipe}`).toMatch(
        new RegExp(`:where\\(\\.factory-dashboard-shell, \\.factory-dashboard-portal\\)[\\s\\S]*${recipe.replace('.', '\\.')}`),
      )
    }

    expect(css).toContain('background-color: var(--ui-panel) !important;')
    expect(css).toContain('background-color: var(--ui-panel-strong) !important;')
    expect(css).toContain('border-color: var(--ui-border) !important;')
    expect(css).toContain('color: var(--ui-text) !important;')
  })

  it('normalizes shared recipe corners inside the Factory dashboard shell', () => {
    const css = readProjectFile('app/assets/css/main.css')

    expect(css).toMatch(
      /:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) :is\([\s\S]*\.ui-panel[\s\S]*\.ui-button[\s\S]*\.ui-field[\s\S]*\.ui-nav-shell[\s\S]*\.ui-avatar[\s\S]*\) {\n\s*border-radius: 0 !important;\n\s*}/,
    )
  })

  it('applies shared UI recipes to Settings/member state surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/index.vue',
        recipes: ['ui-panel-danger', 'ui-icon-tile'],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        recipes: ['ui-icon-tile'],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        recipes: ['ui-icon-tile'],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        recipes: ['ui-icon-tile'],
      },
      {
        path: 'app/pages/dashboard/settings/members.vue',
        recipes: ['ui-icon-tile'],
      },
      {
        path: 'app/pages/dashboard/settings/ai/index.vue',
        recipes: ['ui-empty-panel-dashed', 'ui-icon-tile'],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        recipes: ['ui-empty-panel-dashed', 'ui-icon-tile'],
      },
      {
        path: 'app/components/AiConfigForm.vue',
        recipes: ['ui-icon-tile'],
      },
    ]

    for (const { path, recipes } of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of recipes) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })

  it('keeps Settings/member state surface variants behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/pages/dashboard/settings/index.vue',
        patterns: [
          /ui-panel mt-8 overflow-hidden/,
          /ui-icon-state(?: ui-icon-state-(?:brand|danger))? flex items-center justify-center size-10 shrink-0 rounded-lg/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        patterns: [
          /ui-icon-state(?: ui-icon-state-brand)? flex items-center justify-center size-10 shrink-0 rounded-lg/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        patterns: [
          /ui-icon-state ui-icon-state-brand flex items-center justify-center size-10 shrink-0 rounded-lg/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        patterns: [
          /ui-icon-state ui-icon-state-brand flex items-center justify-center size-10 rounded-lg/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/members.vue',
        patterns: [
          /ui-icon-state ui-icon-state-(?:brand|warning) flex items-center justify-center size-(?:8|10)(?: shrink-0)? rounded-lg/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/ai/index.vue',
        patterns: [
          /ui-empty-panel border-dashed/,
          /ui-icon-state ui-icon-state-brand mx-auto flex size-12 items-center justify-center mb-3/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        patterns: [
          /ui-empty-panel border-dashed/,
          /<ShieldCheck class="size-10 text-surface-300 dark:text-surface-600 mx-auto mb-3" \/>/,
        ],
      },
      {
        path: 'app/components/AiConfigForm.vue',
        patterns: [
          /ui-icon-state ui-icon-state-brand size-9 rounded-xl/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings.vue',
        patterns: [
          /rounded-xl border border-danger-200 dark:border-danger-900 bg-danger-50\/50 dark:bg-danger-950\/30/,
          /text-danger-500/,
          /text-danger-700 dark:text-danger-300/,
          /inline-flex items-center gap-2 rounded-lg bg-brand-600/,
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

  it('keeps remaining Settings and member surface choices behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/components/SettingsSidebar.vue',
        patterns: [
          /text-brand-500\/70 dark:text-brand-400\/60/,
          /ui-nav-shell flex h-full w-56 min-w-56 flex-col border-r/,
        ],
      },
      {
        path: 'app/components/SettingsMobileNav.vue',
        patterns: [
          /ui-nav-shell border-b shadow-sm/,
        ],
      },
      {
        path: 'app/layouts/settings.vue',
        patterns: [
          /factory-dashboard-shell flex min-h-screen flex-col bg-black text-white/,
          /border border-brand-500\/35 bg-brand-500\/10/,
          /text-brand-300 underline decoration-brand-400\/40/,
        ],
      },
      {
        path: 'app/components/AiConfigForm.vue',
        patterns: [
          /ring-1 ring-brand-500\/30/,
          /border-t border-surface-200 dark:border-surface-800 bg-white\/90/,
          /text-warning-500/,
          /hover:bg-surface-50 dark:hover:bg-surface-800\/50/,
          /absolute inset-y-0 right-0 flex items-center px-3 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200/,
          /cursor-pointer hover:text-surface-700 dark:hover:text-surface-200/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings.vue',
        patterns: [
          /rounded-xl border border-danger-200 dark:border-danger-900 bg-danger-50\/50 dark:bg-danger-950\/30/,
          /text-danger-500/,
          /text-danger-700 dark:text-danger-300/,
          /inline-flex items-center gap-2 rounded-lg bg-brand-600/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/index.vue',
        patterns: [
          /class="flex-1 bg-transparent px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none/,
          /focus-within:border-brand-500/,
          /bg-surface-50 dark:bg-surface-800\/50 border-r/,
          /text-danger-500/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        patterns: [
          /ring-2 ring-surface-(?:100|200)/,
          /bg-brand-100 dark:bg-brand-900/,
          /textColor: 'text-(?:danger|brand|success)-500'/,
          /textColor: 'text-warning-500'/,
          /hover:text-surface-600 dark:hover:text-surface-300/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        patterns: [
          /accent-brand-600/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        patterns: [
          /text-success-600 dark:text-success-400 font-medium/,
          /text-warning-600 dark:text-warning-400/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        patterns: [
          /hover:text-danger-500/,
          /border-t border-surface-100 dark:border-surface-800/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/members.vue',
        patterns: [
          /ring-2 ring-surface-100/,
          /bg-brand-100 dark:bg-brand-900/,
          /divide-y divide-surface-100/,
          /rounded-none border-x-0 border-t-0/,
          /border-b border-surface-100 dark:border-surface-800/,
          /border-t border-surface-100 dark:border-surface-800/,
          /bg-black\/50 backdrop-blur-sm/,
          /ui-panel absolute right-0 top-full mt-1 w-48 shadow-lg/,
          /w-full px-3 py-2 text-left text-sm text-surface-700 dark:text-surface-300 flex items-center gap-2 disabled:opacity-50 bg-transparent border-0 cursor-pointer/,
          /ui-feedback-danger w-full px-3 py-2 text-left text-sm flex items-center gap-2 bg-transparent border-0 cursor-pointer/,
          /size-3\.5 text-surface-400/,
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

  it('keeps interview detail surface choices behind shared recipes', () => {
    const source = readProjectFile('app/pages/dashboard/interviews/[id].vue')

    for (const pattern of [
      /class: 'bg-brand-50 text-brand-700 ring-brand-200/,
      /border border-surface-300 dark:border-surface-700 bg-white\/80/,
      /rounded-xl border border-brand-200/,
      /rounded-xl border border-surface-200 dark:border-surface-800 bg-white/,
      /rounded-xl border border-danger-200\/60/,
      /bg-white dark:bg-surface-900 rounded-2xl/,
      /focus:ring-brand-500/,
      /bg-emerald-/,
      /text-emerald-/,
    ]) {
      expect(source, `interview detail should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps modal form surface choices behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/components/ApplyCandidateModal.vue',
        patterns: [
          /bg-white dark:bg-surface-900 rounded-xl/,
          /border border-surface-200 dark:border-surface-700 bg-white/,
          /focus:ring-brand-500/,
          /text-brand-600 dark:text-brand-400/,
        ],
      },
      {
        path: 'app/components/FeedbackModal.vue',
        patterns: [
          /bg-white dark:bg-surface-900 rounded-xl/,
          /border border-surface-200 dark:border-surface-700 bg-white/,
          /focus:ring-brand-500/,
          /bg-brand-600/,
          /border-red-300/,
          /border-amber-300/,
          /bg-green-100/,
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

  it('keeps specialized menu and filter control choices behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/components/SavedViewsMenu.vue',
        patterns: [
          /inline-flex items-center gap-1\.5 rounded-lg border px-3 py-2/,
          /border-brand-300 bg-brand-50 text-brand-700/,
          /absolute left-0 top-full mt-1\.5 z-30 w-72 rounded-xl border border-surface-200/,
          /border-t border-surface-100 dark:border-surface-800 bg-surface-50\/60/,
          /rounded-md border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /rounded-md bg-brand-600 px-3 py-1\.5/,
          /text-brand-600 dark:text-brand-400 hover:bg-brand-50/,
          /focus:ring-brand-500/,
        ],
      },
      {
        path: 'app/components/ColumnsMenu.vue',
        patterns: [
          /inline-flex items-center gap-1\.5 rounded-lg border px-3 py-2/,
          /border-brand-300 bg-brand-50 text-brand-700/,
          /rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /border-b border-surface-100 dark:border-surface-800/,
          /bg-brand-600 border-brand-600 text-white/,
        ],
      },
      {
        path: 'app/components/OrgSwitcher.vue',
        patterns: [
          /bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md/,
          /bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-md shadow-lg/,
          /bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400/,
          /border-t border-surface-200 dark:border-surface-700/,
        ],
      },
      {
        path: 'app/components/PropertyFilterBar.vue',
        patterns: [
          /rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950\/40/,
          /rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900/,
          /inline-flex items-center gap-1 rounded-full border border-dashed border-surface-300/,
          /focus:ring-brand-500\/20/,
        ],
      },
      {
        path: 'app/components/PropertyValueEditor.vue',
        patterns: [
          /bg-brand-600 border-brand-600 hover:bg-brand-700 hover:border-brand-700/,
          /rounded border border-brand-500 bg-white dark:bg-surface-900/,
          /rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg/,
          /border-t border-surface-100 dark:border-surface-800/,
          /rounded bg-brand-600 px-2 py-1/,
          /ring-2 ring-brand-500/,
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

  it('keeps application drawer portal choices behind shared recipes', () => {
    const source = readProjectFile('app/components/ApplicationDetailDrawer.vue')

    for (const pattern of [
      /border-l border-white\/12 bg-black text-white/,
      /border-b border-white\/10 bg-white\/\[0\.035\]/,
      /border border-white\/12 bg-white\/\[0\.025\]/,
      /border border-white\/10 bg-white\/\[0\.04\]/,
      /border border-danger-500\/45 bg-danger-500\/10/,
      /border border-white\/16 bg-black/,
      /border border-dashed border-white\/12 bg-black/,
      /focus:ring-brand-500\/40/,
      /placeholder:text-white\/34/,
      /border-b border-white\/10/,
      /text-brand-600 hover:text-brand-700 dark:text-brand-400/,
    ]) {
      expect(source, `application drawer should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps candidate drawer surface choices behind shared recipes', () => {
    const source = readProjectFile('app/components/CandidateDetailSidebar.vue')

    for (const pattern of [
      /const transitionClasses/,
      /const statusBadgeClasses/,
      /rounded-xl border border-surface-200\/80 dark:border-surface-800\/60 bg-white dark:bg-surface-950/,
      /rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800/,
      /rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950/,
      /relative bg-white dark:bg-surface-900 rounded-2xl/,
      /bg-brand-600 px-3 py-1\.5/,
      /bg-danger-600 px-3 py-1\.5/,
      /text-brand-600 hover:text-brand-700 dark:text-brand-400/,
      /focus:ring-brand-500/,
    ]) {
      expect(source, `candidate drawer should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps interview scheduling sidebar surface choices behind shared recipes', () => {
    const source = readProjectFile('app/components/InterviewScheduleSidebar.vue')

    for (const pattern of [
      /relative w-full max-w-2xl bg-white dark:bg-surface-900 shadow-2xl/,
      /rounded-xl border border-danger-200\/60 bg-danger-50\/80/,
      /border border-surface-200 dark:border-surface-700\/80 bg-white dark:bg-surface-800/,
      /border border-surface-200\/80 dark:border-surface-700\/60 bg-white dark:bg-surface-800\/40/,
      /rounded-xl bg-brand-600 px-4/,
      /focus:ring-brand-500\/20/,
      /focus:ring-brand-500\/30/,
      /border-t border-surface-200\/60 dark:border-surface-800\/40 bg-white\/80/,
    ]) {
      expect(source, `interview schedule sidebar should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps dashboard home panel and card choices behind shared recipes', () => {
    const source = readProjectFile('app/pages/dashboard/index.vue')

    for (const pattern of [
      /const statusBadgeClasses/,
      /rounded-2xl border border-surface-200(?:\/80)? dark:border-surface-800 bg-white dark:bg-surface-900/,
      /group relative rounded-2xl bg-white dark:bg-surface-900/,
      /rounded-3xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
      /rounded-2xl border border-danger-200 dark:border-danger-900 bg-danger-50 dark:bg-danger-950\/60/,
      /inline-flex items-center gap-2\.5 rounded-xl bg-brand-600/,
      /inline-flex items-center gap-1\.5 sm:gap-2 rounded-xl bg-brand-600/,
      /divide-y divide-surface-100 dark:divide-surface-800/,
      /border-b border-surface-100 dark:border-surface-800/,
      /text-brand-600 dark:text-brand-400 hover:text-brand-700/,
    ]) {
      expect(source, `dashboard home should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps timeline and updates page-level surface choices behind shared recipes', () => {
    const timeline = readProjectFile('app/pages/dashboard/timeline.vue')
    const updates = readProjectFile('app/pages/dashboard/updates.vue')

    for (const pattern of [
      /function getStatusBadgeClasses/,
      /w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
      /rounded-lg border border-danger-200 dark:border-danger-900 bg-danger-50 dark:bg-danger-950\/60/,
      /rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
      /inline-flex items-center gap-2 rounded-lg bg-brand-600/,
      /rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900\/60/,
      /border-b border-surface-100 dark:border-surface-800 bg-surface-50\/50/,
      /divide-y divide-surface-100 dark:divide-surface-800\/60/,
      /border-t border-surface-100 dark:border-surface-800\/60/,
      /text-brand-600 dark:text-brand-400 hover:underline/,
    ]) {
      expect(timeline, `timeline should centralize ${pattern}`).not.toMatch(pattern)
    }

    for (const pattern of [
      /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
      /rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/,
      /rounded-xl border border-brand-200 dark:border-brand-900 bg-white dark:bg-surface-900/,
      /px-6 py-5 border-b border-surface-200 dark:border-surface-800/,
      /inline-flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/,
      /inline-flex items-center gap-2 rounded-lg bg-brand-600/,
      /rounded-lg bg-surface-50 dark:bg-surface-800\/50 border border-surface-200 dark:border-surface-800/,
      /ml-10 rounded-xl border transition-all duration-200/,
      /border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-sm/,
      /border-transparent hover:border-surface-200 dark:hover:border-surface-700 bg-white\/60/,
      /border-t border-surface-100 dark:border-surface-800/,
      /rounded-lg bg-surface-900 dark:bg-surface-950/,
    ]) {
      expect(updates, `updates should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps job settings surface choices behind shared recipes', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')

    for (const pattern of [
      /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6/,
      /rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950/,
      /w-full rounded-lg border(?: border-surface-300 dark:border-surface-700)? px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800/,
      /size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500/,
      /rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50\/50 dark:bg-brand-950\/30/,
      /flex-1 rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-surface-900/,
      /inline-flex items-center gap-1\.5 rounded-lg bg-brand-600/,
      /inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600/,
      /rounded-xl border border-danger-200 dark:border-danger-800\/60 bg-danger-50\/50 dark:bg-danger-950\/20/,
      /rounded-lg border border-danger-300 dark:border-danger-700 bg-white dark:bg-surface-900/,
      /inline-flex cursor-pointer items-center gap-1\.5 rounded-lg bg-danger-600/,
      /inline-flex cursor-pointer items-center gap-1\.5 rounded-lg border border-surface-300 dark:border-surface-700/,
      /text-danger-500/,
      /text-brand-600 dark:text-brand-400/,
      /focus:ring-brand-500/,
    ]) {
      expect(source, `job settings should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('applies shared UI recipes to job detail pipeline surfaces', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    for (const recipe of [
      'getApplicationStatusBadgeClass',
      'getApplicationStatusDotClass',
      'getApplicationStatusLabel',
      'getApplicationTransitionButtonClass',
      'getApplicationTransitionLabel',
      'getInterviewStatusBadgeClass',
      'getInterviewStatusLabel',
      'getInterviewTransitionButtonClass',
      'getInterviewTransitionLabel',
      'getScoreBadgeClass',
      'getScoreTextClass',
      'ui-alert-danger',
      'ui-button',
      'ui-button-ghost',
      'ui-button-ghost-danger',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-checkbox',
      'ui-checkbox-brand',
      'ui-empty-panel',
      'ui-feedback-danger',
      'ui-field',
      'ui-field-invalid',
      'ui-filter-chip',
      'ui-filter-chip-active',
      'ui-filter-chip-inactive',
      'ui-floating-menu',
      'ui-icon-state',
      'ui-icon-tile',
      'ui-inline-link',
      'ui-inline-link-brand',
      'ui-list-row',
      'ui-menu-action',
      'ui-modal-backdrop',
      'ui-modal-panel',
      'ui-panel',
      'ui-panel-divider',
      'ui-panel-header',
      'ui-panel-muted',
      'ui-pill',
      'ui-spinner-brand',
      'ui-tab',
      'ui-tab-active',
      'ui-tab-inactive',
    ]) {
      expect(source, `job detail pipeline should use ${recipe}`).toContain(recipe)
    }
  })

  it('keeps job detail pipeline surface and control choices behind shared recipes', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    for (const pattern of [
      /const statusBadgeClasses:/,
      /const transitionLabels:/,
      /const transitionClasses:/,
      /const interviewStatusClasses:/,
      /const interviewTransitionClasses:/,
      /const interviewTransitionLabels:/,
      /function scoreClass/,
      /const jobStatusBadgeClasses:/,
      /size-8 rounded-full border-2 border-brand-200 border-t-brand-600/,
      /m-6 rounded-xl border border-danger-200\/80 bg-danger-50/,
      /shrink-0 border-b border-surface-200\/80 bg-white/,
      /hidden md:flex md:w-72 md:shrink-0 flex-col border-r border-surface-200\/80 bg-white/,
      /w-full rounded-lg border border-surface-200\/80 bg-surface-50\/80/,
      /absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-surface-200 bg-white/,
      /rounded-lg border border-surface-200\/80 bg-surface-50\/80 p-2\.5/,
      /size-3\.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500/,
      /border-b border-surface-200\/80 bg-white px-4/,
      /cursor-pointer px-3\.5 py-2\.5 text-sm font-medium transition-all duration-150 border-b-2 -mb-px/,
      /absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-surface-200/,
      /rounded-xl border border-surface-200\/80 bg-white p-5 shadow-sm/,
      /rounded-xl border border-surface-200\/80 bg-white p-10 text-center/,
      /w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/,
      /w-full rounded-lg border px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800/,
      /text-danger-600 dark:text-danger-400/,
      /absolute inset-0 bg-black\/60 backdrop-blur-sm/,
      /relative flex flex-col bg-white dark:bg-surface-900 rounded-2xl/,
    ]) {
      expect(source, `job detail pipeline should centralize ${pattern}`).not.toMatch(pattern)
    }
  })

  it('applies shared UI recipes to job creation and question form surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/jobs/new.vue',
        recipes: [
          'ui-alert-danger',
          'ui-alert-warning',
          'ui-button-primary',
          'ui-button-secondary',
          'ui-button-ghost',
          'ui-checkbox',
          'ui-checkbox-brand',
          'ui-feedback-danger',
          'ui-field',
          'ui-field-invalid',
          'ui-icon-brand',
          'ui-inline-link',
          'ui-inline-link-brand',
          'ui-list-divider',
          'ui-list-row',
          'ui-panel',
          'ui-panel-brand',
          'ui-panel-header',
          'ui-panel-muted',
          'ui-pill',
          'ui-pill-brand',
          'ui-required-marker',
          'ui-selectable-panel',
          'ui-selectable-panel-active',
          'ui-step-marker',
        ],
      },
      {
        path: 'app/components/JobQuestions.vue',
        recipes: [
          'ui-alert-danger',
          'ui-button-secondary',
          'ui-button-ghost',
          'ui-button-ghost-danger',
          'ui-list-row',
          'ui-panel',
          'ui-pill-brand',
        ],
      },
      {
        path: 'app/components/QuestionForm.vue',
        recipes: [
          'ui-button-ghost',
          'ui-button-ghost-danger',
          'ui-checkbox',
          'ui-checkbox-brand',
          'ui-feedback-danger',
          'ui-field',
          'ui-field-invalid',
          'ui-inline-link-brand',
          'ui-panel-muted',
          'ui-required-marker',
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

  it('keeps job creation and question form theme choices behind shared recipes', () => {
    const paths = [
      'app/pages/dashboard/jobs/new.vue',
      'app/components/JobQuestions.vue',
      'app/components/QuestionForm.vue',
    ]
    const disallowedPatterns = [
      /rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/,
      /rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-950/,
      /w-full rounded-lg border px-3 py-2\.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-900/,
      /w-full rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-2 text-sm bg-white dark:bg-surface-900/,
      /inline-flex items-center gap-1\.5 rounded-lg border border-dashed border-surface-300 dark:border-surface-700/,
      /px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700/,
      /px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 bg-white dark:bg-surface-900 border border-surface-300 dark:border-surface-700/,
      /size-4 rounded border-surface-300 dark:border-surface-700 text-brand-600 focus:ring-brand-500/,
      /mt-0\.5 size-4 rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500/,
      /text-danger-500/,
      /text-brand-600 dark:text-brand-400/,
      /focus:ring-brand-500/,
    ]

    for (const path of paths) {
      const source = readProjectFile(path)

      for (const pattern of disallowedPatterns) {
        expect(source, `${path} should centralize ${pattern}`).not.toMatch(pattern)
      }
    }
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
          'ui-alert-danger',
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
          'ui-alert-danger',
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
          /rounded-xl border border-danger-200\/80 bg-danger-50/,
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
          /rounded-xl border border-danger-200 bg-danger-50/,
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
})
