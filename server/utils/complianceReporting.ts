/**
 * Factory Careers privacy policy for aggregate compliance reporting.
 * This conservative product threshold is not a legal safe harbor.
 */
export const MIN_COMPLIANCE_REPORTING_COHORT = 5

export type ComplianceReportingBreakdownName =
  | 'sex'
  | 'raceEthnicity'
  | 'veteranStatus'
  | 'disabilityStatus'

export interface ComplianceReportingInputBucket {
  value: string | null
  count: number
}

export type ComplianceReportingBreakdownsInput = Record<
  ComplianceReportingBreakdownName,
  readonly ComplianceReportingInputBucket[]
>

export interface ComplianceReportingBucket {
  value: string | null
  count: number
  suppressed: false
}

export interface ComplianceReportingDimension {
  buckets: ComplianceReportingBucket[]
  suppressed: boolean
}

export type ComplianceReportingBreakdowns = Record<
  ComplianceReportingBreakdownName,
  ComplianceReportingDimension
>

export interface ProtectedComplianceReporting {
  totalResponses: number | null
  suppressed: boolean
  minimumCohortSize: typeof MIN_COMPLIANCE_REPORTING_COHORT
  breakdowns: ComplianceReportingBreakdowns
}

export function protectComplianceReporting(
  totalResponses: number,
  breakdowns: ComplianceReportingBreakdownsInput,
): ProtectedComplianceReporting {
  if (totalResponses < MIN_COMPLIANCE_REPORTING_COHORT) {
    return {
      totalResponses: null,
      suppressed: true,
      minimumCohortSize: MIN_COMPLIANCE_REPORTING_COHORT,
      breakdowns: suppressedBreakdowns(),
    }
  }

  const sex = protectBreakdown(totalResponses, breakdowns.sex)
  const raceEthnicity = protectBreakdown(totalResponses, breakdowns.raceEthnicity)
  const veteranStatus = protectBreakdown(totalResponses, breakdowns.veteranStatus)
  const disabilityStatus = protectBreakdown(totalResponses, breakdowns.disabilityStatus)

  return {
    totalResponses,
    suppressed: sex.suppressed
      || raceEthnicity.suppressed
      || veteranStatus.suppressed
      || disabilityStatus.suppressed,
    minimumCohortSize: MIN_COMPLIANCE_REPORTING_COHORT,
    breakdowns: {
      sex,
      raceEthnicity,
      veteranStatus,
      disabilityStatus,
    },
  }
}

function suppressedBreakdowns(): ComplianceReportingBreakdowns {
  return {
    sex: suppressedDimension(),
    raceEthnicity: suppressedDimension(),
    veteranStatus: suppressedDimension(),
    disabilityStatus: suppressedDimension(),
  }
}

function protectBreakdown(
  totalResponses: number,
  rows: readonly ComplianceReportingInputBucket[],
): ComplianceReportingDimension {
  const rowTotal = rows.reduce((sum, row) => sum + row.count, 0)
  const hasSmallBucket = rows.some(row => row.count < MIN_COMPLIANCE_REPORTING_COHORT)

  if (rowTotal !== totalResponses || hasSmallBucket) {
    return suppressedDimension()
  }

  return {
    suppressed: false,
    buckets: rows
      .map(row => ({ ...row, suppressed: false as const }))
      .sort((left, right) =>
        right.count - left.count || compareValues(left.value, right.value),
      ),
  }
}

function suppressedDimension(): ComplianceReportingDimension {
  return {
    suppressed: true,
    buckets: [],
  }
}

function compareValues(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
