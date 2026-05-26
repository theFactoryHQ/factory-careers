import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')

describe('invitation access pages', () => {
  it('uses Factory auth actions for organization invitations', () => {
    const source = read('app/pages/auth/accept-invitation/[id].vue')

    expect(source).toContain('factory-auth-access-actions')
    expect(source).toContain('factory-auth-slide-action')
    expect(source).toContain('data-hover-effect="slide"')
    expect(source).toContain('factory-auth-secondary-action')
    expect(source).not.toContain('bg-brand-600')
    expect(source).not.toContain('rounded-md')
  })

  it('uses Factory auth actions for invite-link routes', () => {
    const source = read('app/pages/join/[token].vue')
    const styles = read('app/assets/css/main.css')

    expect(source).toContain('factory-auth-slide-action')
    expect(source).toContain('data-hover-effect="slide"')
    expect(source).toContain('factory-auth-secondary-action')
    expect(source).toContain('factory-auth-state-copy text-center')
    expect(source).toContain('factory-auth-invite-summary')
    expect(source).not.toContain('ui-button ui-button-primary')
    expect(source).not.toContain('ui-button ui-button-secondary')
    expect(source).not.toContain('ui-panel-muted p-5')
    expect(source).toContain('formatInviteLinkError(err)')
    expect(source).not.toContain("err?.data?.statusMessage || err?.statusMessage || 'This invite link is invalid or has expired.'")

    expect(styles).toContain('.factory-auth-panel .factory-auth-secondary-action')
    expect(styles).toContain(':not([class*="factory-auth-secondary-action"])')
    expect(styles).toContain('.factory-auth-panel .factory-auth-state-copy h2')
    expect(styles).toContain('.factory-auth-panel .factory-auth-invite-summary')
  })
})
