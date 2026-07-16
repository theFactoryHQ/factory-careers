import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createError } from 'h3'
import type * as databaseSchema from '../database/schema'
import { application, candidate, propertyDefinition, propertyValue } from '../database/schema'
import {
  validateValueForType,
  type PropertyEntityType,
  type PropertyType,
} from './schemas/property'

// ─────────────────────────────────────────────
// Property loading & attachment helpers
// ─────────────────────────────────────────────

export type PropertyDefinitionRow = {
  id: string
  organizationId: string
  jobId: string | null
  entityType: PropertyEntityType
  type: PropertyType
  name: string
  description: string | null
  displayOrder: number
  config: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export type PropertyEntry = {
  definition: PropertyDefinitionRow
  value: unknown
}

type PropertyDatabase = PostgresJsDatabase<typeof databaseSchema>

export function propertyDefinitionVisibilityCondition(opts: {
  organizationId: string
  entityType: PropertyEntityType
  jobId?: string | null
}) {
  const { organizationId, entityType, jobId } = opts
  return entityType === 'candidate'
    ? and(
        eq(propertyDefinition.organizationId, organizationId),
        eq(propertyDefinition.entityType, 'candidate'),
        isNull(propertyDefinition.jobId),
      )
    : and(
        eq(propertyDefinition.organizationId, organizationId),
        eq(propertyDefinition.entityType, 'application'),
        jobId
          ? or(isNull(propertyDefinition.jobId), eq(propertyDefinition.jobId, jobId))
          : isNull(propertyDefinition.jobId),
      )
}

/**
 * Load all property definitions visible in a given context.
 *  - Candidate context: org-global candidate definitions only.
 *  - Application context: org-global application defs + per-job defs for jobId (additive).
 *
 * Ordered by (jobId NULLS FIRST, displayOrder, createdAt) so org-global props
 * always render first.
 */
export async function loadPropertyDefinitions(opts: {
  organizationId: string
  entityType: PropertyEntityType
  jobId?: string | null
}): Promise<PropertyDefinitionRow[]> {
  const where = propertyDefinitionVisibilityCondition(opts)

  const rows = await db
    .select()
    .from(propertyDefinition)
    .where(where)
    .orderBy(
      sql`${propertyDefinition.jobId} NULLS FIRST`,
      propertyDefinition.displayOrder,
      propertyDefinition.createdAt,
    )

  return rows as unknown as PropertyDefinitionRow[]
}

/**
 * Load values for a single entity, returning [{ definition, value }] entries
 * in the same order as definitions (missing values surface as `value: null`).
 */
export async function loadPropertyEntriesForEntity(opts: {
  organizationId: string
  entityType: PropertyEntityType
  entityId: string
  jobId?: string | null
}): Promise<PropertyEntry[]> {
  const definitions = await loadPropertyDefinitions(opts)
  if (definitions.length === 0) return []

  const values = await db
    .select({
      propertyDefinitionId: propertyValue.propertyDefinitionId,
      value: propertyValue.value,
    })
    .from(propertyValue)
    .where(
      and(
        eq(propertyValue.organizationId, opts.organizationId),
        eq(propertyValue.entityType, opts.entityType),
        eq(propertyValue.entityId, opts.entityId),
        inArray(
          propertyValue.propertyDefinitionId,
          definitions.map((d) => d.id),
        ),
      ),
    )

  const valueMap = new Map(values.map((v) => [v.propertyDefinitionId, v.value]))
  return definitions.map((definition) => ({
    definition,
    value: valueMap.get(definition.id) ?? null,
  }))
}

/**
 * Bulk load values for many entities. Returns a Map<entityId, PropertyEntry[]>
 * suitable for splicing into list endpoint responses.
 */
export async function loadPropertyEntriesForEntities(opts: {
  organizationId: string
  entityType: PropertyEntityType
  entityIds: string[]
  /**
   * For application list responses we may want per-job props too. The
   * caller passes the union of jobIds; we then load all defs whose jobId
   * is null OR in that set.
   */
  jobIds?: string[]
  /**
   * Optional per-entity job-id map. When provided, each entity only
   * receives org-global defs plus defs scoped to that entity's own jobId,
   * so mixed-job lists don't leak unrelated job properties across rows.
   */
  entityJobIds?: Map<string, string | null | undefined>
}, database: PropertyDatabase = db): Promise<Map<string, PropertyEntry[]>> {
  const { organizationId, entityType, entityIds, jobIds, entityJobIds } = opts
  if (entityIds.length === 0) return new Map()

  const where = jobIds && jobIds.length > 0 && entityType === 'application'
    ? and(
        eq(propertyDefinition.organizationId, organizationId),
        eq(propertyDefinition.entityType, 'application'),
        or(isNull(propertyDefinition.jobId), inArray(propertyDefinition.jobId, jobIds)),
      )
    : propertyDefinitionVisibilityCondition({ organizationId, entityType })

  const definitions = (await database
    .select()
    .from(propertyDefinition)
    .where(where)
    .orderBy(
      sql`${propertyDefinition.jobId} NULLS FIRST`,
      propertyDefinition.displayOrder,
      propertyDefinition.createdAt,
    )) as unknown as PropertyDefinitionRow[]

  if (definitions.length === 0) return new Map(entityIds.map((id) => [id, []]))

  const values = await database
    .select({
      propertyDefinitionId: propertyValue.propertyDefinitionId,
      entityId: propertyValue.entityId,
      value: propertyValue.value,
    })
    .from(propertyValue)
    .where(
      and(
        eq(propertyValue.organizationId, organizationId),
        eq(propertyValue.entityType, entityType),
        inArray(propertyValue.entityId, entityIds),
        inArray(
          propertyValue.propertyDefinitionId,
          definitions.map((d) => d.id),
        ),
      ),
    )

  const map = new Map<string, PropertyEntry[]>()
  for (const id of entityIds) map.set(id, [])

  // Build a per-entity value lookup
  const byEntity = new Map<string, Map<string, unknown>>()
  for (const v of values) {
    let perEntity = byEntity.get(v.entityId)
    if (!perEntity) {
      perEntity = new Map()
      byEntity.set(v.entityId, perEntity)
    }
    perEntity.set(v.propertyDefinitionId, v.value)
  }

  for (const entityId of entityIds) {
    const list = map.get(entityId)!
    const perEntity = byEntity.get(entityId)
    const ownJobId = entityJobIds?.get(entityId) ?? null
    for (const def of definitions) {
      // Each entity sees org-global defs (jobId === null) plus only the
      // defs bound to its own jobId. When the caller doesn't pass
      // entityJobIds, fall back to legacy behavior (include all loaded defs).
      if (entityJobIds && def.jobId !== null && def.jobId !== ownJobId) continue
      list.push({ definition: def, value: perEntity?.get(def.id) ?? null })
    }
  }

  return map
}

export type PropertyFilter = {
  propertyDefinitionId: string
  op: 'equals' | 'contains' | 'in' | 'isEmpty' | 'isNotEmpty'
  value?: unknown
}

type PropertyDefinitionVisibilityInput = {
  organizationId: string
  entityType: PropertyEntityType
  jobId?: string | null
  definitionIds: string[]
}

export async function loadVisiblePropertyDefinitionIds(
  opts: PropertyDefinitionVisibilityInput,
  database: PropertyDatabase = db,
): Promise<string[]> {
  const definitionIds = [...new Set(opts.definitionIds)]
  if (definitionIds.length === 0) return []

  const rows = await database
    .select({ id: propertyDefinition.id })
    .from(propertyDefinition)
    .where(and(
      propertyDefinitionVisibilityCondition(opts),
      inArray(propertyDefinition.id, definitionIds),
    ))

  return rows.map(row => row.id)
}

export type PropertyDefinitionIdLoader = (
  opts: PropertyDefinitionVisibilityInput,
) => Promise<string[]>

export async function validatePropertyFilterDefinitions(opts: {
  organizationId: string
  entityType: PropertyEntityType
  jobId?: string | null
  filters: PropertyFilter[]
}, loadDefinitionIds: PropertyDefinitionIdLoader = loadVisiblePropertyDefinitionIds): Promise<void> {
  const definitionIds = [...new Set(opts.filters.map(filter => filter.propertyDefinitionId))]
  if (definitionIds.length === 0) return

  const visibleIds = await loadDefinitionIds({
    organizationId: opts.organizationId,
    entityType: opts.entityType,
    jobId: opts.jobId,
    definitionIds,
  })
  if (new Set(visibleIds).size !== definitionIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
  }
}

function nonEmptyPropertyValueCondition(): SQL {
  return sql`${propertyValue.value} is not null
    and jsonb_typeof(${propertyValue.value}) <> 'null'
    and not (
      jsonb_typeof(${propertyValue.value}) = 'string'
      and ${propertyValue.value} = '""'::jsonb
    )
    and not (
      jsonb_typeof(${propertyValue.value}) = 'array'
      and jsonb_array_length(${propertyValue.value}) = 0
    )`
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}

export function buildPropertyFiltersCondition(opts: {
  organizationId: string
  entityType: PropertyEntityType
  entityIdColumn: typeof application.id | typeof candidate.id
  filters: PropertyFilter[]
}): SQL | undefined {
  const predicates = opts.filters.map((filter) => {
    const baseWhere = and(
      eq(propertyValue.organizationId, opts.organizationId),
      eq(propertyValue.entityType, opts.entityType),
      eq(propertyValue.propertyDefinitionId, filter.propertyDefinitionId),
      eq(propertyValue.entityId, opts.entityIdColumn),
    )

    if (filter.op === 'isEmpty') {
      return sql`not exists (
        select 1 from ${propertyValue}
        where ${baseWhere} and ${nonEmptyPropertyValueCondition()}
      )`
    }

    let valueCondition: SQL
    if (filter.op === 'isNotEmpty') {
      valueCondition = nonEmptyPropertyValueCondition()
    }
    else if (filter.op === 'equals') {
      const serializedValue = JSON.stringify(filter.value)
      valueCondition = serializedValue === undefined
        ? sql`false`
        : sql`${propertyValue.value} = ${serializedValue}::jsonb`
    }
    else if (filter.op === 'contains') {
      const pattern = `%${escapeLikePattern(String(filter.value ?? '').toLowerCase())}%`
      valueCondition = sql`jsonb_typeof(${propertyValue.value}) in ('string', 'number', 'boolean')
        and lower(${propertyValue.value} #>> '{}') like ${pattern} escape '\\'`
    }
    else {
      const values = Array.isArray(filter.value) ? filter.value.map(String) : []
      valueCondition = values.length > 0
        ? sql`jsonb_typeof(${propertyValue.value}) = 'array'
          and ${propertyValue.value} ?| array[${sql.join(values.map(value => sql`${value}`), sql`, `)}]::text[]`
        : sql`false`
    }

    return sql`exists (
      select 1 from ${propertyValue}
      where ${baseWhere} and ${valueCondition}
    )`
  })

  return and(...predicates)
}

export async function validatedPropertyFiltersCondition(opts: {
  organizationId: string
  entityType: PropertyEntityType
  jobId?: string | null
  entityIdColumn: typeof application.id | typeof candidate.id
  filters: PropertyFilter[]
}): Promise<SQL | undefined> {
  await validatePropertyFilterDefinitions(opts)
  return buildPropertyFiltersCondition(opts)
}

export async function setEntityPropertyValue(opts: {
  organizationId: string
  entityType: PropertyEntityType
  entityId: string
  propId: string
  value: unknown
}) {
  const { organizationId, entityType, entityId, propId, value } = opts

  let applicationJobId: string | undefined

  if (entityType === 'candidate') {
    const cand = await db.query.candidate.findFirst({
      where: and(eq(candidate.id, entityId), eq(candidate.organizationId, organizationId)),
      columns: { id: true },
    })
    if (!cand) throw createError({ statusCode: 404, statusMessage: 'Candidate not found' })
  } else {
    const app = await db.query.application.findFirst({
      where: and(eq(application.id, entityId), eq(application.organizationId, organizationId)),
      columns: { id: true, jobId: true },
    })
    if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })
    applicationJobId = app.jobId
  }

  const def = await db.query.propertyDefinition.findFirst({
    where: and(
      eq(propertyDefinition.id, propId),
      eq(propertyDefinition.organizationId, organizationId),
    ),
  })
  if (!def) throw createError({ statusCode: 404, statusMessage: 'Property not found' })

  if (entityType === 'application' && def.jobId && def.jobId !== applicationJobId) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Property is scoped to a different job',
    })
  }

  if (def.entityType !== entityType) {
    throw createError({
      statusCode: 422,
      statusMessage: `Property is not a ${entityType} property`,
    })
  }

  const normalized = validateValueForType(def.type as PropertyType, value, def.config)

  if (normalized === null) {
    await db
      .delete(propertyValue)
      .where(
        and(
          eq(propertyValue.organizationId, organizationId),
          eq(propertyValue.propertyDefinitionId, propId),
          eq(propertyValue.entityId, entityId),
          eq(propertyValue.entityType, entityType),
        ),
      )
    return { value: null }
  }

  const [row] = await db
    .insert(propertyValue)
    .values({
      organizationId,
      propertyDefinitionId: propId,
      entityType,
      entityId,
      value: normalized as never,
    })
    .onConflictDoUpdate({
      target: [propertyValue.propertyDefinitionId, propertyValue.entityId],
      set: { value: normalized as never, updatedAt: new Date() },
    })
    .returning({ value: propertyValue.value })

  return { value: row?.value ?? normalized }
}
