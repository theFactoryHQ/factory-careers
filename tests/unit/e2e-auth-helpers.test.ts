import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E auth helpers', () => {
  it('exports shared sign-up helpers for fixtures and secondary accounts', () => {
    const source = readProjectFile('e2e/helpers/auth.ts')

    for (const exportName of [
      'signUpOnPage',
      'createOrganizationOnPage',
      'signUpUser',
    ]) {
      expect(source, exportName).toContain(exportName)
    }
  })

  it('re-exports signUpUser and org-less fixture wiring from fixtures', () => {
    const fixtures = readProjectFile('e2e/fixtures.ts')

    expect(fixtures).toContain('authenticatedPageWithoutOrg')
    expect(fixtures).toContain('signUpUser')
    expect(fixtures).toContain('./helpers/auth')
  })

  it('is adopted by migrated specs with local sign-up helpers removed', () => {
    const migratedSpecs = [
      'e2e/critical-flows/org-admin-membership.spec.ts',
      'e2e/critical-flows/rbac-role-permissions.spec.ts',
    ]

    for (const spec of migratedSpecs) {
      const source = readProjectFile(spec)
      expect(source, spec).toContain('signUpUser')
      expect(source, spec).not.toContain('async function signUpWithoutOrganization')
      expect(source, spec).not.toContain('async function signUpWithOrg')
    }
  })
})