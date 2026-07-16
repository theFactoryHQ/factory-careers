import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  createJobRequestFromForm,
  jobPostingSelectValuesFromJob,
  jobPostingPatchFromForm,
  type CreateJobRequest,
  type JobCurrency,
  type UpdateJobRequest,
} from '../../shared/job-contract'
import type { SalaryUnitValue } from '../../shared/salary-options'
import { createJobSchema, updateJobSchema } from '../../server/utils/schemas/job'

describe('job request contract', () => {
  it('keeps server create defaults compatible with the shared request contract', () => {
    const parsed = createJobSchema.parse({ title: 'Platform Recruiter' })

    expect(parsed).toMatchObject({
      title: 'Platform Recruiter',
      divisions: [],
      descriptionBlocks: [],
      type: 'full_time',
      salaryNegotiable: false,
      salaryDisplayOnListing: false,
      requireResume: false,
      requireCoverLetter: false,
      applicationComplianceEnabled: true,
      includeEeo: true,
      includeVeteran: true,
      includeDisability: true,
      autoScoreOnApply: true,
    })
    expect(parsed.activeFrom).toBeInstanceOf(Date)

    const request: CreateJobRequest = { title: 'Platform Recruiter' }
    expect(request).toEqual({ title: 'Platform Recruiter' })
  })

  it('preserves PATCH omission and explicit-null clearing semantics', () => {
    const omitted: UpdateJobRequest = { title: 'Updated title' }
    expect(updateJobSchema.parse(omitted)).toEqual({ title: 'Updated title' })

    const cleared: UpdateJobRequest = {
      description: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryUnit: null,
      remoteStatus: null,
      validThrough: null,
      scoringBands: null,
      experienceLevel: null,
    }
    expect(updateJobSchema.parse(cleared)).toEqual(cleared)

    expect(updateJobSchema.safeParse({ title: null }).success).toBe(false)
    expect(updateJobSchema.safeParse({ type: null }).success).toBe(false)
    expect(updateJobSchema.safeParse({ activeFrom: null }).success).toBe(false)
  })

  it('adapts the create form without sending blank optional values', () => {
    const request = createJobRequestFromForm({
      title: 'Platform Recruiter',
      description: '',
      divisions: ['factory_services'],
      descriptionBlocks: [{ type: 'paragraph', body: 'Build hiring systems.' }],
      location: ' ',
      type: 'full_time',
      experienceLevel: 'mid',
      remoteStatus: undefined,
      activeFrom: '2026-07-16',
      requireResume: true,
      requireCoverLetter: false,
      autoScoreOnApply: false,
    })

    expect(request).toEqual({
      title: 'Platform Recruiter',
      divisions: ['factory_services'],
      descriptionBlocks: [{ type: 'paragraph', body: 'Build hiring systems.' }],
      type: 'full_time',
      experienceLevel: 'mid',
      activeFrom: new Date(2026, 6, 16),
      requireResume: true,
      requireCoverLetter: false,
      autoScoreOnApply: false,
    })
    expect(request).not.toHaveProperty('description')
    expect(request).not.toHaveProperty('location')
    expect(request).not.toHaveProperty('remoteStatus')
  })

  it('adapts posting form blanks to nullable clears while preserving zero and false', () => {
    const patch = jobPostingPatchFromForm({
      title: 'Platform Recruiter',
      descriptionBlocks: [{ type: 'paragraph', body: 'Build hiring systems.' }],
      divisions: ['factory_services'],
      city: '',
      state: '',
      type: 'full_time',
      slug: '',
      salaryMin: 0,
      salaryMax: 0,
      salaryCurrency: '',
      salaryUnit: '',
      salaryNegotiable: false,
      salaryDisplayOnListing: false,
      remoteStatus: '',
      experienceLevel: '',
      activeFrom: '2026-07-16',
      validThrough: '',
    }, { defaultSalaryUnit: 'YEAR', defaultCurrency: 'USD' })

    expect(patch).toEqual({
      title: 'Platform Recruiter',
      description: 'Build hiring systems.',
      divisions: ['factory_services'],
      descriptionBlocks: [{ type: 'paragraph', body: 'Build hiring systems.' }],
      location: null,
      type: 'full_time',
      salaryMin: 0,
      salaryMax: 0,
      salaryCurrency: 'USD',
      salaryUnit: 'YEAR',
      salaryNegotiable: false,
      salaryDisplayOnListing: false,
      remoteStatus: null,
      experienceLevel: null,
      activeFrom: new Date(2026, 6, 16),
      validThrough: null,
    })
    expect(patch).not.toHaveProperty('slug')
  })

  it('narrows database-backed select values before hydrating the posting form', () => {
    const selectedValues = jobPostingSelectValuesFromJob({
      salaryCurrency: 'CAD',
      salaryUnit: 'MONTH',
      remoteStatus: 'hybrid',
      experienceLevel: 'senior',
    }, { defaultSalaryUnit: 'YEAR' })

    expectTypeOf(selectedValues.salaryCurrency).toEqualTypeOf<JobCurrency>()
    expectTypeOf(selectedValues.salaryUnit).toEqualTypeOf<SalaryUnitValue>()
    expect(selectedValues).toEqual({
      salaryCurrency: 'CAD',
      salaryUnit: 'MONTH',
      remoteStatus: 'hybrid',
      experienceLevel: 'senior',
    })

    expect(jobPostingSelectValuesFromJob({
      salaryCurrency: 'BTC',
      salaryUnit: 'WEEK',
      remoteStatus: 'teleport',
      experienceLevel: 'principal',
    }, { defaultSalaryUnit: 'HOUR' })).toEqual({
      salaryCurrency: 'USD',
      salaryUnit: 'HOUR',
      remoteStatus: '',
      experienceLevel: '',
    })
  })
})
