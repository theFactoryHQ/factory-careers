import { z } from 'zod'

/** Reusable `:id` route param for org-scoped resources */
export const resourceIdParamSchema = z.object({
  id: z.string().min(1),
})

/** Reusable UUID `:id` route param */
export const uuidParamSchema = z.object({
  id: z.string().uuid(),
})

/** Candidate/application property value routes */
export const entityPropertyParamsSchema = z.object({
  id: z.string().min(1),
  propId: z.string().min(1),
})