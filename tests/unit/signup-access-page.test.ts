import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')

describe('sign-up access request page', () => {
  it('uses Factory auth actions for the invitation-only state', () => {
    const source = read('app/pages/auth/sign-up.vue')
    const styles = read('app/assets/css/main.css')

    expect(source).toContain('factory-auth-access-actions')
    expect(source).toContain('factory-auth-slide-action')
    expect(source).toContain('data-hover-effect="slide"')
    expect(source).not.toContain('Return to Factory')
    expect(source).not.toContain('factory-auth-outline-action')
    expect(source).not.toContain('rounded-md bg-brand-600')

    expect(styles).toContain('.factory-auth-panel .factory-auth-slide-action')
    expect(styles).toContain('.factory-auth-panel .factory-auth-slide-action::before')
    expect(styles).toContain('background-color: var(--color-brand-500);')
    expect(styles).toContain('transform: translate3d(0, 100%, 0);')
    expect(styles).toContain('.factory-auth-panel .factory-auth-slide-action:hover')
    expect(styles).toContain('color: #ffffff !important;')
    expect(styles).not.toContain('factory-auth-outline-action')
    expect(styles).toContain(':not([class*="factory-auth-slide-action"])')
  })
})
