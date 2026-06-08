/**
 * Application pipeline status constants — single source of truth for
 * server analytics, API validation, and dashboard pipeline counts.
 */

export const APPLICATION_STATUSES = [
  'new',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export type PipelineCounts = Record<ApplicationStatus, number>

/** Returns a zeroed pipeline count map for every application status. */
export function emptyPipelineCounts(): PipelineCounts {
  return {
    new: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
  }
}