import { sql, type SQL } from 'drizzle-orm'
import { applicationSearchDocument } from '../database/schema'

/** Escape PostgreSQL LIKE metacharacters before wrapping a search term in `%`. */
export function applicationSearchPattern(search: string): string | null {
  const normalized = search.trim()
  if (!normalized) return null
  return `%${normalized.replace(/[%_\\]/g, '\\$&')}%`
}

/** Build the indexed, tenant-scoped application-content search predicate. */
export function applicationContentSearchCondition(search: string, organizationId: string): SQL | undefined {
  const pattern = applicationSearchPattern(search)
  if (!pattern) return undefined

  return sql`(
    ${applicationSearchDocument.organizationId} = ${organizationId}
    AND ${applicationSearchDocument.searchText} ILIKE ${pattern} ESCAPE '\\'
  )`
}
