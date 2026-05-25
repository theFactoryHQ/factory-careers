import { createError } from 'h3'
import { propertyFiltersArraySchema, type PropertyEntityType } from './schemas/property'
import { entityIdsMatchingFilters, type PropertyFilter } from './properties'

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

export async function matchingEntityIdsForPropertyFilters(opts: {
  organizationId: string
  entityType: PropertyEntityType
  filters: PropertyFilter[]
}): Promise<Set<string> | null> {
  if (opts.filters.length === 0) return null

  return entityIdsMatchingFilters({
    organizationId: opts.organizationId,
    entityType: opts.entityType,
    filters: opts.filters,
  })
}
