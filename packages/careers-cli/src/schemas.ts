import { z } from 'zod'
import { candidateEmailSchema } from '../../../shared/schemas/candidate'

const optionalText = z.string().trim().min(1).optional()

export const cliJobCreateSchema = z.object({
  title: z.string().trim().min(1),
  status: optionalText,
  location: optionalText,
  type: optionalText,
  description: optionalText,
}).passthrough()

export const cliCandidateCreateSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: candidateEmailSchema,
  phone: optionalText,
}).passthrough()

export const cliApplicationCreateSchema = z.object({
  candidateId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  status: optionalText,
}).passthrough()

export const cliInterviewScheduleSchema = z.object({
  applicationId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  scheduledAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().positive().optional(),
}).passthrough()
