import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

type OrgScopedTable = {
  id: unknown
  organizationId: unknown
}

export function orgScopedIdWhere(
  table: OrgScopedTable,
  id: string,
  organizationId: string,
): SQL {
  return and(
    eq(table.id as never, id),
    eq(table.organizationId as never, organizationId),
  )!
}

export async function findOrgScopedOr404<T>(
  query: Promise<T | undefined>,
  notFoundMessage = 'Resource not found',
): Promise<T> {
  const row = await query
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: notFoundMessage })
  }
  return row
}