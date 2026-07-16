import { CURRENCY_VALUES } from './currency-options'
import { dateInputToEndOfLocalDay, dateInputToStartOfLocalDay } from './date-input'
import { buildJobLocation, type UsStateValue } from './job-location'
import {
  jobDescriptionBlocksToMarkdown,
  normalizeJobDescriptionBlocks,
  type FactoryDivision,
  type JobDescriptionBlock,
} from './job-listing-structure'
import { SALARY_UNIT_VALUES, type SalaryUnitValue } from './salary-options'
import type { ScoringBand } from './scoring-bands'

export const JOB_TYPE_VALUES = ['full_time', 'part_time', 'contract', 'internship'] as const
export type JobType = typeof JOB_TYPE_VALUES[number]

export const JOB_STATUS_VALUES = ['draft', 'open', 'closed', 'archived'] as const
export type JobStatus = typeof JOB_STATUS_VALUES[number]

export const JOB_REMOTE_STATUS_VALUES = ['remote', 'hybrid', 'onsite'] as const
export type JobRemoteStatus = typeof JOB_REMOTE_STATUS_VALUES[number]

export const JOB_EXPERIENCE_LEVEL_VALUES = ['junior', 'mid', 'senior', 'lead'] as const
export type JobExperienceLevel = typeof JOB_EXPERIENCE_LEVEL_VALUES[number]

export type JobCurrency = typeof CURRENCY_VALUES[number]

/**
 * JSON request contract shared by browser and server code. Dates may be supplied
 * as Date objects by $fetch callers or as serialized values by external clients.
 */
export type CreateJobRequest = {
  title: string
  description?: string
  divisions?: FactoryDivision[]
  descriptionBlocks?: JobDescriptionBlock[]
  location?: string
  type?: JobType
  slug?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: JobCurrency | null
  salaryUnit?: SalaryUnitValue | null
  salaryNegotiable?: boolean
  salaryDisplayOnListing?: boolean
  remoteStatus?: JobRemoteStatus | null
  activeFrom?: Date | string
  validThrough?: Date | string | null
  requireResume?: boolean
  requireCoverLetter?: boolean
  applicationComplianceEnabled?: boolean
  includeEeo?: boolean
  includeVeteran?: boolean
  includeDisability?: boolean
  autoScoreOnApply?: boolean
  scoringBands?: ScoringBand[] | null
  experienceLevel?: JobExperienceLevel
}

/** Normalized create payload returned by the server validator after defaults. */
export type ValidatedCreateJobRequest = Omit<
  CreateJobRequest,
  | 'divisions'
  | 'descriptionBlocks'
  | 'type'
  | 'salaryNegotiable'
  | 'salaryDisplayOnListing'
  | 'activeFrom'
  | 'requireResume'
  | 'requireCoverLetter'
  | 'applicationComplianceEnabled'
  | 'includeEeo'
  | 'includeVeteran'
  | 'includeDisability'
  | 'autoScoreOnApply'
  | 'validThrough'
> & {
  divisions: FactoryDivision[]
  descriptionBlocks: JobDescriptionBlock[]
  type: JobType
  salaryNegotiable: boolean
  salaryDisplayOnListing: boolean
  activeFrom: Date
  validThrough?: Date | null
  requireResume: boolean
  requireCoverLetter: boolean
  applicationComplianceEnabled: boolean
  includeEeo: boolean
  includeVeteran: boolean
  includeDisability: boolean
  autoScoreOnApply: boolean
}

/** PATCH contract: omitted fields are unchanged; null only clears nullable fields. */
export type UpdateJobRequest = {
  title?: string
  description?: string | null
  divisions?: FactoryDivision[]
  descriptionBlocks?: JobDescriptionBlock[]
  location?: string | null
  type?: JobType
  slug?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: JobCurrency | null
  salaryUnit?: SalaryUnitValue | null
  salaryNegotiable?: boolean
  salaryDisplayOnListing?: boolean
  remoteStatus?: JobRemoteStatus | null
  activeFrom?: Date | string
  validThrough?: Date | string | null
  requireResume?: boolean
  requireCoverLetter?: boolean
  applicationComplianceEnabled?: boolean
  includeEeo?: boolean
  includeVeteran?: boolean
  includeDisability?: boolean
  autoScoreOnApply?: boolean
  scoringBands?: ScoringBand[] | null
  experienceLevel?: JobExperienceLevel | null
  status?: JobStatus
}

export type ValidatedUpdateJobRequest = Omit<UpdateJobRequest, 'activeFrom' | 'validThrough'> & {
  activeFrom?: Date
  validThrough?: Date | null
}

export type CreateJobFormValues = {
  title: string
  description: string
  divisions: FactoryDivision[]
  descriptionBlocks: JobDescriptionBlock[]
  location: string
  type: JobType
  experienceLevel: JobExperienceLevel
  remoteStatus: JobRemoteStatus | undefined
  activeFrom: string
  requireResume: boolean
  requireCoverLetter: boolean
  autoScoreOnApply: boolean
}

export function createJobRequestFromForm(form: CreateJobFormValues): CreateJobRequest {
  const description = form.description.trim()
  const location = form.location.trim()

  return {
    title: form.title,
    ...(description ? { description } : {}),
    divisions: form.divisions,
    descriptionBlocks: form.descriptionBlocks,
    ...(location ? { location } : {}),
    type: form.type,
    experienceLevel: form.experienceLevel,
    ...(form.remoteStatus ? { remoteStatus: form.remoteStatus } : {}),
    activeFrom: dateInputToStartOfLocalDay(form.activeFrom),
    requireResume: form.requireResume,
    requireCoverLetter: form.requireCoverLetter,
    autoScoreOnApply: form.autoScoreOnApply,
  }
}

export type JobPostingFormValues = {
  title: string
  divisions: FactoryDivision[]
  descriptionBlocks: JobDescriptionBlock[]
  city: string
  state: UsStateValue | ''
  type: JobType
  slug: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: JobCurrency | ''
  salaryUnit: SalaryUnitValue | ''
  salaryNegotiable: boolean
  salaryDisplayOnListing: boolean
  remoteStatus: JobRemoteStatus | ''
  experienceLevel: JobExperienceLevel | ''
  activeFrom: string
  validThrough: string
}

export function jobPostingSelectValuesFromJob(
  job: {
    salaryCurrency?: string | null
    salaryUnit?: string | null
    remoteStatus?: string | null
    experienceLevel?: string | null
  },
  defaults: { defaultSalaryUnit?: string | null },
): {
  salaryCurrency: JobCurrency
  salaryUnit: SalaryUnitValue
  remoteStatus: JobRemoteStatus | ''
  experienceLevel: JobExperienceLevel | ''
} {
  return {
    salaryCurrency: CURRENCY_VALUES.find(value => value === job.salaryCurrency) ?? 'USD',
    salaryUnit: SALARY_UNIT_VALUES.find(value => value === job.salaryUnit)
      ?? SALARY_UNIT_VALUES.find(value => value === defaults.defaultSalaryUnit)
      ?? 'YEAR',
    remoteStatus: JOB_REMOTE_STATUS_VALUES.find(value => value === job.remoteStatus) ?? '',
    experienceLevel: JOB_EXPERIENCE_LEVEL_VALUES.find(value => value === job.experienceLevel) ?? '',
  }
}

export function jobPostingPatchFromForm(
  form: JobPostingFormValues,
  defaults: { defaultSalaryUnit: SalaryUnitValue, defaultCurrency: JobCurrency },
): UpdateJobRequest {
  const descriptionBlocks = normalizeJobDescriptionBlocks(form.descriptionBlocks)
  const location = buildJobLocation({ city: form.city, state: form.state })
  const slug = form.slug.trim()

  return {
    title: form.title,
    description: jobDescriptionBlocksToMarkdown(descriptionBlocks) || null,
    divisions: form.divisions,
    descriptionBlocks,
    location: location || null,
    type: form.type,
    ...(slug ? { slug } : {}),
    salaryMin: form.salaryMin,
    salaryMax: form.salaryMax,
    salaryCurrency: form.salaryCurrency || defaults.defaultCurrency,
    salaryUnit: form.salaryUnit || defaults.defaultSalaryUnit,
    salaryNegotiable: form.salaryNegotiable,
    salaryDisplayOnListing: form.salaryDisplayOnListing,
    remoteStatus: form.remoteStatus || null,
    experienceLevel: form.experienceLevel || null,
    activeFrom: dateInputToStartOfLocalDay(form.activeFrom),
    validThrough: form.validThrough ? dateInputToEndOfLocalDay(form.validThrough) : null,
  }
}
