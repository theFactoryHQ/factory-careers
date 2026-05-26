import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('Microsoft sign-in button presentation', () => {
  it('uses Microsoft sign-in phrasing for the SSO action', () => {
    const source = read('app/pages/auth/sign-in.vue')

    expect(source).toContain('Sign in with Microsoft')
    expect(source).toContain('aria-label="Sign in with Microsoft"')
    expect(source).not.toContain('Continue with Microsoft')
  })

  it('uses the Factory slide-up orange hover treatment for the provider button', () => {
    const source = read('app/pages/auth/sign-in.vue')
    const styles = read('app/assets/css/main.css')

    expect(source).toContain('data-hover-effect="slide"')
    expect(source).toContain('border-transparent')
    expect(source).not.toContain('border-brand-500 bg-white')
    expect(styles).toContain('.factory-auth-panel form > button.factory-microsoft-signin-button[type="submit"]::before')
    expect(styles).toContain('border-color: transparent !important;')
    expect(styles).toContain('background-color: var(--color-brand-500);')
    expect(styles).toContain('transform: translate3d(0, 100%, 0);')
    expect(styles).toContain('.factory-auth-panel form > button.factory-microsoft-signin-button[type="submit"]:hover:not(:disabled)::before')
    expect(styles).toContain('transform: translate3d(0, 0, 0);')
    expect(styles).toContain('color: #ffffff !important;')
    expect(styles).toContain('.factory-auth-panel form > button.factory-microsoft-signin-button[type="submit"] svg rect')
    expect(styles).toContain('transition: fill 150ms ease;')
    expect(styles).toContain('.factory-auth-panel form > button.factory-microsoft-signin-button[type="submit"]:hover:not(:disabled) svg rect')
    expect(styles).toContain('fill: #ffffff;')
    expect(styles).toContain('.factory-auth-panel form > button.factory-microsoft-signin-button[type="submit"]:active:not(:disabled)')
    expect(styles).toContain('.factory-auth-panel form > button.factory-microsoft-signin-button[type="submit"]:focus-visible')
  })
})
