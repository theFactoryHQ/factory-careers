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
      '.ui-status-dot-success',
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
          'ui-field',
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
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-field', 'ui-alert-danger', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/dashboard/settings/account.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-field', 'ui-alert-danger', 'ui-button-primary'],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-panel-muted', 'ui-field', 'ui-alert-danger', 'ui-button-primary'],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-panel-muted', 'ui-alert-danger', 'ui-alert-success', 'ui-button-primary', 'ui-button-danger', 'ui-button-secondary'],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        recipes: ['ui-settings-page', 'ui-settings-page-header', 'ui-settings-panel', 'ui-settings-panel-header', 'ui-settings-panel-body', 'ui-panel-muted', 'ui-empty-panel', 'ui-field', 'ui-alert-danger', 'ui-alert-success', 'ui-button-primary', 'ui-button-secondary', 'ui-button-danger-outline'],
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
      'ui-alert-danger',
      'ui-alert-success',
      'ui-button-primary',
      'ui-button-secondary',
      'ui-button-danger',
      'ui-button-danger-outline',
      'ui-button-success',
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
})
