import { describe, expect, it } from 'vitest'
import {
  MIN_COMPLIANCE_REPORTING_COHORT,
  protectComplianceReporting,
  type ComplianceReportingBreakdownsInput,
} from '../../server/utils/complianceReporting'

function makeBreakdowns(
  overrides: Partial<ComplianceReportingBreakdownsInput> = {},
): ComplianceReportingBreakdownsInput {
  return {
    sex: [],
    raceEthnicity: [],
    veteranStatus: [],
    disabilityStatus: [],
    ...overrides,
  }
}

describe('compliance reporting privacy policy', () => {
  it('suppresses all breakdowns when the response cohort is below five', () => {
    const result = protectComplianceReporting(4, makeBreakdowns({
      sex: [
        { value: 'female', count: 3 },
        { value: 'male', count: 1 },
      ],
    }))

    expect(MIN_COMPLIANCE_REPORTING_COHORT).toBe(5)
    expect(result).toEqual({
      suppressed: true,
      minimumCohortSize: 5,
      breakdowns: {
        sex: [],
        raceEthnicity: [],
        veteranStatus: [],
        disabilityStatus: [],
      },
    })
  })

  it('hides small cells and complementarily suppresses the next-smallest cell', () => {
    const result = protectComplianceReporting(20, makeBreakdowns({
      raceEthnicity: [
        { value: 'small-cell', count: 1 },
        { value: 'largest-cell', count: 14 },
        { value: 'next-smallest-cell', count: 5 },
      ],
    }))

    expect(result.suppressed).toBe(true)
    expect(result.breakdowns.raceEthnicity).toEqual([
      { value: 'largest-cell', count: 14, suppressed: false },
      { value: 'suppressed', count: null, suppressed: true },
      { value: 'suppressed', count: null, suppressed: true },
    ])
    expect(JSON.stringify(result)).not.toContain('small-cell')
    expect(JSON.stringify(result)).not.toContain('next-smallest-cell')
  })

  it('omits null buckets without confusing them with suppressed cells', () => {
    const result = protectComplianceReporting(13, makeBreakdowns({
      veteranStatus: [
        { value: null, count: 3 },
        { value: 'protected_veteran', count: 5 },
        { value: 'not_protected_veteran', count: 5 },
      ],
    }))

    expect(result.suppressed).toBe(false)
    expect(result.breakdowns.veteranStatus).toEqual([
      { value: 'not_protected_veteran', count: 5, suppressed: false },
      { value: 'protected_veteran', count: 5, suppressed: false },
    ])
    expect(result.breakdowns.veteranStatus).not.toContainEqual(
      expect.objectContaining({ value: null }),
    )
  })

  it('returns normal counts in a deterministic order when every cell is reportable', () => {
    const result = protectComplianceReporting(18, makeBreakdowns({
      disabilityStatus: [
        { value: 'yes', count: 6 },
        { value: 'prefer_not_to_answer', count: 6 },
        { value: 'no', count: 6 },
      ],
    }))

    expect(result).toEqual({
      suppressed: false,
      minimumCohortSize: 5,
      breakdowns: {
        sex: [],
        raceEthnicity: [],
        veteranStatus: [],
        disabilityStatus: [
          { value: 'no', count: 6, suppressed: false },
          { value: 'prefer_not_to_answer', count: 6, suppressed: false },
          { value: 'yes', count: 6, suppressed: false },
        ],
      },
    })
  })
})
