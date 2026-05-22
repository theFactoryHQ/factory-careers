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
      '.ui-button',
      '.ui-button-primary',
      '.ui-button-secondary',
      '.ui-button-ghost',
      '.ui-field',
      '.ui-icon-state',
      '.ui-icon-state-danger',
      '.ui-icon-state-success',
      '.ui-icon-state-brand',
      '.ui-empty-state',
      '.ui-selectable-panel',
      '.ui-selectable-panel-active',
      '.ui-pill',
      '.ui-pill-brand',
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
      'app/pages/dashboard/ai-analysis.vue',
    ]

    for (const path of recipeUsage) {
      const source = readProjectFile(path)

      for (const recipe of ['ui-table-shell', 'ui-table-header', 'ui-table-row']) {
        expect(source, `${path} should use ${recipe}`).toContain(recipe)
      }
    }
  })
})
