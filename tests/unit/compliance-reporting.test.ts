import { describe, expect, it } from 'vitest'
import {
  MIN_COMPLIANCE_REPORTING_COHORT,
  protectComplianceReporting,
  type ComplianceReportingBreakdownsInput,
} from '../../server/utils/complianceReporting'

function makeCoherentBreakdowns(
  totalResponses: number,
  overrides: Partial<ComplianceReportingBreakdownsInput> = {},
): ComplianceReportingBreakdownsInput {
  return {
    sex: [{ value: null, count: totalResponses }],
    raceEthnicity: [{ value: null, count: totalResponses }],
    veteranStatus: [{ value: null, count: totalResponses }],
    disabilityStatus: [{ value: null, count: totalResponses }],
    ...overrides,
  }
}

describe('compliance reporting privacy policy', () => {
  it('protects the total and every dimension when the response cohort is below five', () => {
    const result = protectComplianceReporting(4, makeCoherentBreakdowns(4, {
      sex: [
        { value: 'female', count: 3 },
        { value: 'male', count: 1 },
      ],
    }))

    expect(MIN_COMPLIANCE_REPORTING_COHORT).toBe(5)
    expect(result).toEqual({
      totalResponses: null,
      suppressed: true,
      minimumCohortSize: 5,
      breakdowns: {
        sex: { suppressed: true, buckets: [] },
        raceEthnicity: { suppressed: true, buckets: [] },
        veteranStatus: { suppressed: true, buckets: [] },
        disabilityStatus: { suppressed: true, buckets: [] },
      },
    })
  })

  it('suppresses a complete dimension when its null bucket is below five', () => {
    const result = protectComplianceReporting(13, makeCoherentBreakdowns(13, {
      veteranStatus: [
        { value: null, count: 3 },
        { value: 'protected_veteran', count: 5 },
        { value: 'not_protected_veteran', count: 5 },
      ],
    }))

    expect(result.totalResponses).toBe(13)
    expect(result.suppressed).toBe(true)
    expect(result.breakdowns.veteranStatus).toEqual({
      suppressed: true,
      buckets: [],
    })
    expect(JSON.stringify(result.breakdowns.veteranStatus)).not.toContain('protected_veteran')
  })

  it('reveals no bucket values, counts, or cardinality when multiple cells are small', () => {
    const result = protectComplianceReporting(20, makeCoherentBreakdowns(20, {
      raceEthnicity: [
        { value: 'largest-cell', count: 14 },
        { value: 'small-cell-one', count: 3 },
        { value: 'small-cell-two', count: 3 },
      ],
    }))

    expect(result.totalResponses).toBe(20)
    expect(result.breakdowns.raceEthnicity).toEqual({
      suppressed: true,
      buckets: [],
    })
  })

  it('reveals no within-dimension subtraction signal when exactly one cell is small', () => {
    const result = protectComplianceReporting(20, makeCoherentBreakdowns(20, {
      sex: [
        { value: 'female', count: 19 },
        { value: 'male', count: 1 },
      ],
    }))

    expect(result.totalResponses).toBe(20)
    expect(result.breakdowns.sex).toEqual({
      suppressed: true,
      buckets: [],
    })
  })

  it('suppresses a dimension whose rows do not sum to the protected total', () => {
    const result = protectComplianceReporting(20, makeCoherentBreakdowns(20, {
      disabilityStatus: [
        { value: 'no', count: 10 },
        { value: 'yes', count: 5 },
      ],
    }))

    expect(result.totalResponses).toBe(20)
    expect(result.breakdowns.disabilityStatus).toEqual({
      suppressed: true,
      buckets: [],
    })
  })

  it('returns every coherent reportable bucket deterministically, including no-answer counts', () => {
    const result = protectComplianceReporting(20, {
      sex: [
        { value: 'male', count: 10 },
        { value: 'female', count: 10 },
      ],
      raceEthnicity: [
        { value: null, count: 5 },
        { value: 'white', count: 10 },
        { value: 'black_or_african_american', count: 5 },
      ],
      veteranStatus: [
        { value: 'protected_veteran', count: 5 },
        { value: 'not_protected_veteran', count: 15 },
      ],
      disabilityStatus: [
        { value: null, count: 5 },
        { value: 'prefer_not_to_answer', count: 10 },
        { value: 'no', count: 5 },
      ],
    })

    expect(result).toEqual({
      totalResponses: 20,
      suppressed: false,
      minimumCohortSize: 5,
      breakdowns: {
        sex: {
          suppressed: false,
          buckets: [
            { value: 'female', count: 10, suppressed: false },
            { value: 'male', count: 10, suppressed: false },
          ],
        },
        raceEthnicity: {
          suppressed: false,
          buckets: [
            { value: 'white', count: 10, suppressed: false },
            { value: 'black_or_african_american', count: 5, suppressed: false },
            { value: null, count: 5, suppressed: false },
          ],
        },
        veteranStatus: {
          suppressed: false,
          buckets: [
            { value: 'not_protected_veteran', count: 15, suppressed: false },
            { value: 'protected_veteran', count: 5, suppressed: false },
          ],
        },
        disabilityStatus: {
          suppressed: false,
          buckets: [
            { value: 'prefer_not_to_answer', count: 10, suppressed: false },
            { value: 'no', count: 5, suppressed: false },
            { value: null, count: 5, suppressed: false },
          ],
        },
      },
    })
  })
})
