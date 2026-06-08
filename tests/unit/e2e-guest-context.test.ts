import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E guest context helpers', () => {
  it('exports createGuestPage and withGuestContext', () => {
    const source = readProjectFile('e2e/helpers/guest-context.ts')

    expect(source).toContain('export async function createGuestPage')
    expect(source).toContain('export async function withGuestContext')
  })

  it('re-exports guest helpers from fixtures', () => {
    const fixtures = readProjectFile('e2e/fixtures.ts')

    expect(fixtures).toContain('createGuestPage')
    expect(fixtures).toContain('withGuestContext')
    expect(fixtures).toContain('./helpers/guest-context')
  })

  it('is adopted by representative guest-flow specs', () => {
    const migratedSpecs = [
      'e2e/critical-flows/job-lifecycle.spec.ts',
      'e2e/critical-flows/fake-mail.spec.ts',
      'e2e/critical-flows/public-localization.spec.ts',
      'e2e/critical-flows/tracking-analytics.spec.ts',
      'e2e/critical-flows/auth-recovery-fake-mail.spec.ts',
    ]

    for (const spec of migratedSpecs) {
      const source = readProjectFile(spec)
      expect(source, spec).toMatch(/createGuestPage|withGuestContext/)
      expect(source, spec).not.toContain('browser.newContext()')
    }
  })
})