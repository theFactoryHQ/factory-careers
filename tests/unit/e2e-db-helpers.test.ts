import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E database helpers', () => {
  it('exports shared Postgres lifecycle and lookup helpers', () => {
    const source = readProjectFile('e2e/helpers/db.ts')

    for (const exportName of [
      'assertE2eDatabaseUrl',
      'createE2eDb',
      'closeE2eDb',
      'withE2eDb',
      'lookupMembership',
      'lookupMemberByEmail',
      'lookupJoinRequestStatus',
      'lookupApplicationByEmail',
      'seedParsedResume',
      'seedCrossTenantSentinel',
      'grantOrganizationRole',
      'deleteMembership',
      'expireInviteLink',
      'attributeApplicationSource',
      'insertSsoProvider',
      'lookupPrivacyRequest',
      'lookupCandidateApplication',
      'countCandidateRows',
      'countApplicationRows',
      'countPrivacyAuditRows',
    ]) {
      expect(source, exportName).toContain(exportName)
    }
  })

  it('is adopted by migrated specs with local postgres helpers removed', () => {
    const migratedSpecs = [
      'e2e/critical-flows/org-admin-membership.spec.ts',
      'e2e/critical-flows/rbac-role-permissions.spec.ts',
      'e2e/critical-flows/ai-candidate-review.spec.ts',
      'e2e/security/tenant-isolation.spec.ts',
      'e2e/critical-flows/privacy-request-fake-mail.spec.ts',
    ]

    for (const spec of migratedSpecs) {
      const source = readProjectFile(spec)
      expect(source, spec).toContain('../helpers/db')
      expect(source, spec).not.toContain("import postgres from 'postgres'")
      expect(source, spec).not.toContain('async function lookupMembership(')
    }

    expect(readProjectFile('e2e/critical-flows/org-admin-membership.spec.ts')).toContain('signUpUser')
    expect(readProjectFile('e2e/critical-flows/rbac-role-permissions.spec.ts')).toContain('signUpUser')
  })
})