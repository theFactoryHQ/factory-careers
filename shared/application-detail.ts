import type { ApplicationStatus } from './application-status'
import type { PropertyConfig, PropertyEntityType, PropertyType } from './properties'

export type ApplicationDetailDocument<TDate = string> = {
  id: string
  type: 'resume' | 'cover_letter' | 'other'
  originalFilename: string
  mimeType: string
  parseStatus: 'pending' | 'parsed' | 'no_text' | 'failed'
  parseResultCode: string | null
  createdAt: TDate
}

export type ApplicationDetailPropertyEntry<TDate = string> = {
  definition: {
    id: string
    organizationId: string
    jobId: string | null
    entityType: PropertyEntityType
    type: PropertyType
    name: string
    description: string | null
    displayOrder: number
    config: PropertyConfig
    createdAt: TDate
    updatedAt: TDate
  }
  value: unknown
}

export type ApplicationDetailResponse<TDate = string> = {
  id: string
  organizationId: string
  candidateId: string
  jobId: string
  status: ApplicationStatus
  score: number | null
  currentAnalysisRunId: string | null
  notes: string | null
  coverLetterText: string | null
  createdAt: TDate
  updatedAt: TDate
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    documents: ApplicationDetailDocument<TDate>[]
  }
  job: {
    id: string
    title: string
    status: 'draft' | 'open' | 'closed' | 'archived'
    slug: string
  }
  responses: Array<{
    id: string
    organizationId: string
    applicationId: string
    questionId: string
    value: string | string[] | number | boolean
    createdAt: TDate
    question: {
      id: string
      label: string
      type: 'short_text' | 'long_text' | 'single_select' | 'multi_select' | 'number' | 'date' | 'url' | 'checkbox' | 'file_upload'
      options: string[] | null
    }
  }>
  properties: ApplicationDetailPropertyEntry<TDate>[]
}
