import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicApplicationSchema } from '../../server/utils/schemas/publicApplication'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('public application compliance self-identification', () => {
  const baseApplication = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    country: 'United States',
    state: 'CA',
    responses: [],
  }

  it('allows applicants to omit voluntary compliance answers', () => {
    const parsed = publicApplicationSchema.parse(baseApplication)
    expect(parsed.firstName).toBe('Ada')
    expect(parsed.compliance).toBeUndefined()
  })

  it('accepts normalized US voluntary self-identification answers', () => {
    expect(publicApplicationSchema.parse({
      ...baseApplication,
      compliance: {
        sex: 'female',
        raceEthnicity: 'hispanic_or_latino',
        veteranStatus: 'protected_veteran',
        disabilityStatus: 'prefer_not_to_answer',
      },
    }).compliance).toEqual({
      sex: 'female',
      raceEthnicity: 'hispanic_or_latino',
      veteranStatus: 'protected_veteran',
      disabilityStatus: 'prefer_not_to_answer',
    })
  })

  it('does not collect gender identity values in the EEO sex field', () => {
    const publicApply = readProjectFile('app/pages/jobs/[slug]/apply.vue')

    expect(publicApply).not.toContain('non_binary')
    expect(() => publicApplicationSchema.parse({
      ...baseApplication,
      compliance: {
        sex: 'non_binary',
      },
    })).toThrow()
  })

  it('rejects unsupported compliance values before submission handling', () => {
    expect(() => publicApplicationSchema.parse({
      ...baseApplication,
      compliance: {
        sex: 'decline',
        raceEthnicity: 'other',
        veteranStatus: 'veteran',
        disabilityStatus: 'unknown',
      },
    })).toThrow()
  })

  it('persists compliance responses separately from custom question responses', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const handler = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')

    expect(schema).toContain('applicationComplianceResponse')
    expect(schema).toContain("pgTable('application_compliance_response'")
    expect(handler).toContain('applicationComplianceResponse')
    expect(handler).toContain('hasComplianceResponse')
    expect(handler).not.toContain('questionResponse).values(\\n      validResponses.map((r) => ({\\n        organizationId: orgId,\\n        applicationId: newApplication!.id,\\n        questionId: r.questionId,\\n        value: r.value,\\n        compliance')
  })

  it('renders voluntary questions on the public form without exposing answers in hiring surfaces', () => {
    const publicApply = readProjectFile('app/pages/jobs/[slug]/apply.vue')
    const applicationDetail = readProjectFile('app/pages/dashboard/applications/[id].vue')
    const candidateDetail = readProjectFile('app/pages/dashboard/candidates/[id].vue')

    expect(publicApply).toContain('Voluntary self-identification')
    expect(publicApply).toContain('complianceEnabled')
    expect(publicApply).toContain('const hasComplianceStep = computed(() => (')
    expect(publicApply).toContain('complianceIncludesEeo.value ||')
    expect(publicApply).toContain('complianceIncludesVeteran.value ||')
    expect(publicApply).toContain('complianceIncludesDisability.value')
    expect(publicApply).toContain('currentApplicationStep')
    expect(publicApply).toContain('goToResumeAndQuestionsStep')
    expect(publicApply).toContain('goToComplianceStep')
    expect(publicApply).toContain('v-show="currentApplicationStep === 3"')
    expect(publicApply).toContain('Resume & questions')
    expect(publicApply).toContain('Prefer not to answer')
    expect(publicApply).toContain('Hiring decision-makers do not see individual answers')
    expect(publicApply).toContain('Protected veteran status')
    expect(publicApply).toContain('OFCCP Form CC-305')
    expect(publicApply).toContain('compliance: normalizedCompliance.value')
    expect(applicationDetail).not.toContain('applicationComplianceResponse')
    expect(applicationDetail).not.toContain('disabilityStatus')
    expect(candidateDetail).not.toContain('applicationComplianceResponse')
    expect(candidateDetail).not.toContain('veteranStatus')
  })

  it('uses the shared FactorySelect styling for public application dropdowns', () => {
    const publicApply = readProjectFile('app/pages/jobs/[slug]/apply.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(publicApply).toContain('class="factory-public-form"')
    expect(publicApply).toContain('<FactorySelect')
    expect(publicApply).toContain('v-model="form.country"')
    expect(publicApply).toContain('v-model="form.state"')
    expect(publicApply).toContain('v-model="complianceForm.sex"')
    expect(publicApply).toContain('v-model="complianceForm.raceEthnicity"')
    expect(publicApply).toContain('v-model="complianceForm.veteranStatus"')
    expect(publicApply).toContain('v-model="complianceForm.disabilityStatus"')
    expect(css).toContain(':where(.factory-dashboard-shell, .factory-dashboard-portal, .factory-public-form) .factory-filter-select')
    expect(css).toContain(':where(.factory-dashboard-shell, .factory-dashboard-portal, .factory-public-form) .factory-filter-dropdown-menu')
  })

  it('supports drag-and-drop for the built-in resume upload', () => {
    const publicApply = readProjectFile('app/pages/jobs/[slug]/apply.vue')

    expect(publicApply).toContain('handleResumeDrop')
    expect(publicApply).toContain('@dragover="handleResumeDragOver"')
    expect(publicApply).toContain('@drop="handleResumeDrop"')
    expect(publicApply).toContain('isResumeDragging')
  })

  it('breaks profile links into separate LinkedIn, GitHub, and portfolio fields', () => {
    const dynamicField = readProjectFile('app/components/DynamicField.vue')

    expect(dynamicField).toContain('isProfileLinksQuestion')
    expect(dynamicField).toContain('parseProfileLinksValue')
    expect(dynamicField).toContain('applyProfileLinksFromModel')
    expect(dynamicField).toContain('watch(')
    expect(dynamicField).toContain("['LinkedIn', profileLinks.linkedin]")
    expect(dynamicField).toContain("['GitHub', profileLinks.github]")
    expect(dynamicField).toContain("['Portfolio', profileLinks.portfolio]")
    expect(dynamicField).toContain('`${label}: ${value}`')
    expect(dynamicField).toContain('<Linkedin')
    expect(dynamicField).toContain('<Github')
    expect(dynamicField).toContain('Personal / Portfolio')
  })

  it('adds admin controls and preview support for compliance questions', () => {
    const applicationForm = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')

    expect(applicationForm).toContain('Compliance questions')
    expect(applicationForm).toContain('applicationComplianceEnabled')
    expect(applicationForm).toContain('includeEeo')
    expect(applicationForm).toContain('includeVeteran')
    expect(applicationForm).toContain('includeDisability')
    expect(applicationForm).toContain('Voluntary self-identification')
  })

  it('provides aggregate reporting without returning individual answers', () => {
    const source = readProjectFile('server/api/compliance/applications/summary.get.ts')

    expect(source).toContain('totalResponses')
    expect(source).toContain('breakdowns')
    expect(source).not.toContain('candidateId')
    expect(source).not.toContain('applicationId')
  })
})
