import { z } from 'zod'
import { APPLICATION_STATUSES } from '~~/shared/application-status'
import {
  JOB_PIPELINE_INTERVIEW_FILTER_VALUES,
  JOB_PIPELINE_SCORE_FILTER_VALUES,
  JOB_PIPELINE_SORT_VALUES,
} from '~~/shared/job-pipeline'
import { paginationQuerySchema } from './common'

export const jobPipelineQuerySchema = paginationQuerySchema({
  defaultLimit: 25,
  maxLimit: 50,
}).extend({
  stage: z.enum(APPLICATION_STATUSES).default('new'),
  search: z.string().trim().min(3, 'Search must be at least 3 characters').max(200).optional(),
  candidateSearch: z.string().trim().min(1).max(200).optional(),
  score: z.enum(JOB_PIPELINE_SCORE_FILTER_VALUES).default('all'),
  interviews: z.enum(JOB_PIPELINE_INTERVIEW_FILTER_VALUES).default('all'),
  sort: z.enum(JOB_PIPELINE_SORT_VALUES).default('score-desc'),
  propertyFilters: z.string().optional(),
})
