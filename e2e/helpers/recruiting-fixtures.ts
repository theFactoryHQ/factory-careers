import type { APIRequestContext, APIResponse } from '@playwright/test'
import { expect } from '@playwright/test'

export type JobRecord = {
  id: string
  title: string
  slug?: string
}

export type CandidateRecord = {
  id: string
  email: string
  firstName: string
  lastName: string
}

export type ApplicationRecord = {
  id: string
  status: string
  candidateEmail?: string
}

export const DEFAULT_JOB_PAYLOAD = {
  location: 'Remote',
  type: 'full_time',
  requireResume: false,
  requireCoverLetter: false,
  applicationComplianceEnabled: false,
  autoScoreOnApply: false,
} as const

export async function expectApiStatus(
  response: APIResponse,
  expected: number,
  label: string,
) {
  expect(response.status(), `${label} returned ${response.status()}: ${await response.text()}`).toBe(expected)
}

export async function createJob(
  request: APIRequestContext,
  title: string,
  overrides: Record<string, unknown> = {},
): Promise<JobRecord> {
  const response = await request.post('/api/jobs', {
    data: {
      title,
      description: `Seeded by E2E recruiting fixtures for ${title}.`,
      ...DEFAULT_JOB_PAYLOAD,
      ...overrides,
    },
  })

  await expectApiStatus(response, 201, 'Create job API')
  return await response.json() as JobRecord
}

export async function publishJob(request: APIRequestContext, jobId: string): Promise<JobRecord> {
  const response = await request.patch(`/api/jobs/${jobId}`, {
    data: { status: 'open' },
  })

  await expectApiStatus(response, 200, 'Publish job API')
  return await response.json() as JobRecord
}

export async function createCandidate(
  request: APIRequestContext,
  candidate: Omit<CandidateRecord, 'id'>,
): Promise<CandidateRecord> {
  const response = await request.post('/api/candidates', {
    data: {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
    },
  })

  await expectApiStatus(response, 201, 'Create candidate API')
  return await response.json() as CandidateRecord
}

export async function createApplication(
  request: APIRequestContext,
  input: { candidateId: string, jobId: string, notes?: string },
): Promise<ApplicationRecord> {
  const response = await request.post('/api/applications', {
    data: {
      candidateId: input.candidateId,
      jobId: input.jobId,
      notes: input.notes,
    },
  })

  await expectApiStatus(response, 201, 'Create application API')
  return await response.json() as ApplicationRecord
}

export async function updateApplicationStatus(
  request: APIRequestContext,
  applicationId: string,
  status: string,
): Promise<ApplicationRecord> {
  const response = await request.patch(`/api/applications/${applicationId}`, {
    data: { status },
  })

  await expectApiStatus(response, 200, 'Update application API')
  return await response.json() as ApplicationRecord
}