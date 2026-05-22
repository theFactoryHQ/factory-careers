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
      '.ui-checkbox',
      '.ui-checkbox-brand',
      '.ui-checkbox-warning',
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
      '.ui-icon-brand',
      '.ui-icon-success',
      '.ui-icon-danger',
      '.ui-inline-link',
      '.ui-inline-link-brand',
      '.ui-inline-link-muted',
      '.ui-list-divider',
      '.ui-required-marker',
      '.ui-table-shell',
      '.ui-table-header',
      '.ui-table-row',
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

  it('applies shared UI recipes to settings surfaces', () => {
    const recipeUsage = [
      {
        path: 'app/pages/dashboard/settings/index.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-field', 'ui-field-addon', 'ui-feedback-success', 'ui-feedback-danger', 'ui-alert-danger', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-field', 'ui-alert-danger', 'ui-button-primary', 'ui-meter-track', 'ui-meter-fill', 'ui-meter-label-danger', 'ui-meter-label-brand', 'ui-meter-label-success', 'ui-avatar', 'ui-avatar-brand', 'ui-feedback-success', 'ui-feedback-danger', 'ui-inline-link'],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-panel-muted', 'ui-selectable-panel', 'ui-alert-danger', 'ui-button-primary'],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        recipes: ['ui-panel', 'ui-panel-header', 'ui-panel-muted', 'ui-alert-danger', 'ui-alert-success', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary', 'ui-pill-success', 'ui-status-dot-success', 'ui-code', 'ui-icon-brand', 'ui-icon-success', 'ui-inline-link-brand', 'ui-inline-link-muted', 'ui-feedback-success', 'ui-feedback-warning'],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        recipes: ['ui-panel', 'ui-panel-muted', 'ui-empty-panel', 'ui-field', 'ui-alert-danger', 'ui-alert-success', 'ui-button-primary', 'ui-button-secondary', 'ui-button-danger-outline', 'ui-button-ghost-danger', 'ui-pill-warning', 'ui-pill-success', 'ui-code', 'ui-step-marker', 'ui-required-marker', 'ui-icon-success', 'ui-inline-link-brand'],
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
      'ui-alert-danger',
      'ui-alert-success',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-danger-outline',
      'ui-button-success',
      'ui-empty-state',
      'ui-modal-panel',
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
        recipes: ['ui-panel', 'ui-field', 'ui-checkbox', 'ui-selectable-panel', 'ui-alert-info', 'ui-button-primary', 'ui-button-secondary', 'ui-pill-info', 'ui-pill-success', 'ui-action-bar', 'ui-feedback-success', 'ui-feedback-danger', 'ui-icon-brand', 'ui-inline-link-brand'],
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

    for (const recipe of ['ui-nav-icon', 'ui-nav-icon-active', 'ui-nav-description', 'ui-nav-description-active', 'ui-pill-warning', 'ui-inline-link']) {
      expect(sidebar, `SettingsSidebar should use ${recipe}`).toContain(recipe)
    }
  })

  it('keeps remaining Settings and member surface choices behind shared recipes', () => {
    const disallowedPatternsByFile: Array<{ path: string, patterns: RegExp[] }> = [
      {
        path: 'app/components/SettingsSidebar.vue',
        patterns: [
          /text-brand-500\/70 dark:text-brand-400\/60/,
        ],
      },
      {
        path: 'app/components/AiConfigForm.vue',
        patterns: [
          /ring-1 ring-brand-500\/30/,
          /border-t border-surface-200 dark:border-surface-800 bg-white\/90/,
        ],
      },
      {
        path: 'app/pages/dashboard/settings/index.vue',
        patterns: [
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
        ],
      },
      {
        path: 'app/pages/dashboard/settings/members.vue',
        patterns: [
          /ring-2 ring-surface-100/,
          /bg-brand-100 dark:bg-brand-900/,
          /divide-y divide-surface-100/,
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
})
