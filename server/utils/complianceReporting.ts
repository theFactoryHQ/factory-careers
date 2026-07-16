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

export type ComplianceReportingBucket =
  | {
      value: string
      count: number
      suppressed: false
    }
  | {
      value: 'suppressed'
      count: null
      suppressed: true
    }

export type ComplianceReportingBreakdowns = Record<
  ComplianceReportingBreakdownName,
  ComplianceReportingBucket[]
>

export interface ProtectedComplianceReporting {
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
      suppressed: true,
      minimumCohortSize: MIN_COMPLIANCE_REPORTING_COHORT,
      breakdowns: emptyBreakdowns(),
    }
  }

  const sex = protectBreakdown(breakdowns.sex)
  const raceEthnicity = protectBreakdown(breakdowns.raceEthnicity)
  const veteranStatus = protectBreakdown(breakdowns.veteranStatus)
  const disabilityStatus = protectBreakdown(breakdowns.disabilityStatus)

  return {
    suppressed: sex.suppressed
      || raceEthnicity.suppressed
      || veteranStatus.suppressed
      || disabilityStatus.suppressed,
    minimumCohortSize: MIN_COMPLIANCE_REPORTING_COHORT,
    breakdowns: {
      sex: sex.buckets,
      raceEthnicity: raceEthnicity.buckets,
      veteranStatus: veteranStatus.buckets,
      disabilityStatus: disabilityStatus.buckets,
    },
  }
}

function emptyBreakdowns(): ComplianceReportingBreakdowns {
  return {
    sex: [],
    raceEthnicity: [],
    veteranStatus: [],
    disabilityStatus: [],
  }
}

function protectBreakdown(rows: readonly ComplianceReportingInputBucket[]): {
  buckets: ComplianceReportingBucket[]
  suppressed: boolean
} {
  const sortedRows = rows
    .flatMap((row) => row.value === null ? [] : [{ value: row.value, count: row.count }])
    .sort((left, right) => right.count - left.count || compareValues(left.value, right.value))

  const suppressedIndexes = new Set(
    sortedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.count < MIN_COMPLIANCE_REPORTING_COHORT)
      .map(({ index }) => index),
  )

  if (suppressedIndexes.size === 1 && sortedRows.length > 1) {
    const complementaryIndex = sortedRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !suppressedIndexes.has(index))
      .sort((left, right) =>
        left.row.count - right.row.count
        || compareValues(left.row.value, right.row.value),
      )[0]?.index

    if (complementaryIndex !== undefined) {
      suppressedIndexes.add(complementaryIndex)
    }
  }

  return {
    suppressed: suppressedIndexes.size > 0,
    buckets: sortedRows.map((row, index) => {
      if (suppressedIndexes.has(index)) {
        return {
          value: 'suppressed',
          count: null,
          suppressed: true,
        }
      }

      return {
        ...row,
        suppressed: false,
      }
    }),
  }
}

function compareValues(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
