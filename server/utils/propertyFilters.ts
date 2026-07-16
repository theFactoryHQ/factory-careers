import { createError } from 'h3'
import { propertyFiltersArraySchema } from './schemas/property'
import type { PropertyFilter } from './properties'

export function parsePropertyFiltersParam(value: string | undefined): PropertyFilter[] {
  if (!value) return []

  let raw: unknown
  try {
    raw = JSON.parse(value)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
  }

  const result = propertyFiltersArraySchema.safeParse(raw)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
  }

  return result.data as PropertyFilter[]
}
