import { z } from 'zod'

type PaginationQueryOptions = {
  defaultLimit?: number
  maxLimit?: number
}

/** Reusable list query params for paginated API routes */
export function paginationQuerySchema(options: PaginationQueryOptions = {}) {
  const { defaultLimit = 20, maxLimit = 100 } = options

  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  })
}

export type PaginationQuery = z.infer<ReturnType<typeof paginationQuerySchema>>

/** Offset for SQL `LIMIT`/`OFFSET` pagination. */
export function paginationOffset(page: number, limit: number): number {
  return (page - 1) * limit
}

/** Standard paginated list response envelope. */
export function paginatedListResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return { data, total, page, limit }
}

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