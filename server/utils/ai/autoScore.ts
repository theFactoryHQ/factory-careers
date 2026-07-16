import {
  AnalyzeApplicationError,
  analyzeApplication,
} from '../analyzeApplication'

/**
 * Best-effort AI scoring for a single application.
 * Called when autoScoreOnApply is enabled on a job. Expected prerequisites and
 * provider failures are recorded by the shared analyzer and remain non-blocking.
 */
export async function autoScoreApplication(applicationId: string, organizationId: string) {
  try {
    await analyzeApplication({ organizationId, applicationId })
  }
  catch (error) {
    const isMissingAiConfiguration = typeof error === 'object'
      && error !== null
      && 'statusCode' in error
      && error.statusCode === 422

    if (error instanceof AnalyzeApplicationError || isMissingAiConfiguration) {
      return
    }

    throw error
  }
}
