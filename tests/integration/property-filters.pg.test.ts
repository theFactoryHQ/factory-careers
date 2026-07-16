import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { and, asc, count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'
import {
  buildPropertyFiltersCondition,
  loadVisiblePropertyDefinitionIds,
  validatePropertyFilterDefinitions,
  type PropertyFilter,
} from '../../server/utils/properties'

const adminUrl = process.env.PROPERTY_FILTER_PG_TEST_URL
  ?? process.env.PROCESSING_QUEUE_PG_TEST_URL
  ?? process.env.SCORING_RUN_PG_TEST_URL
const describeWithPostgres = adminUrl ? describe : describe.skip
const migrationsFolder = join(process.cwd(), 'server/database/migrations')

function databaseUrl(databaseName: string) {
  const url = new URL(adminUrl!)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function collectPlanNodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(collectPlanNodes)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(collectPlanNodes)]
}

describeWithPostgres('property filters on PostgreSQL', () => {
  it('validates definition visibility and applies correlated filters before count and pagination', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const databaseName = `careers_properties_${suffix}`

    try {
      await admin.unsafe(`create database "${databaseName}"`)
      const client = postgres(databaseUrl(databaseName), { max: 4, onnotice: () => undefined })
      const database = drizzle(client, { schema })

      try {
        await migrate(database, { migrationsFolder })
        const orgA = `property_${suffix}_org_a`
        const orgB = `property_${suffix}_org_b`
        const jobA = `property_${suffix}_job_a`
        const jobB = `property_${suffix}_job_b`
        await client`insert into "organization" ("id", "name", "slug") values
          (${orgA}, 'Property A', ${`property-${suffix}-a`}),
          (${orgB}, 'Property B', ${`property-${suffix}-b`})`
        await client`insert into "job" ("id", "organization_id", "title", "slug") values
          (${jobA}, ${orgA}, 'Property Job A', ${`property-${suffix}-job-a`}),
          (${jobB}, ${orgA}, 'Property Job B', ${`property-${suffix}-job-b`})`

        const definitions = {
          appGlobal: `property_${suffix}_app_global`,
          appJobA: `property_${suffix}_app_job_a`,
          appJobB: `property_${suffix}_app_job_b`,
          candidateGlobal: `property_${suffix}_candidate_global`,
          candidateJob: `property_${suffix}_candidate_job`,
          foreign: `property_${suffix}_foreign`,
          empty: `property_${suffix}_empty`,
          checkbox: `property_${suffix}_checkbox`,
          number: `property_${suffix}_number`,
          multi: `property_${suffix}_multi`,
        }
        await client`insert into "property_definition"
          ("id", "organization_id", "job_id", "entity_type", "type", "name") values
          (${definitions.appGlobal}, ${orgA}, null, 'application', 'text', 'Global'),
          (${definitions.appJobA}, ${orgA}, ${jobA}, 'application', 'text', 'Job A'),
          (${definitions.appJobB}, ${orgA}, ${jobB}, 'application', 'text', 'Job B'),
          (${definitions.candidateGlobal}, ${orgA}, null, 'candidate', 'text', 'Candidate'),
          (${definitions.candidateJob}, ${orgA}, ${jobA}, 'candidate', 'text', 'Invalid Candidate Job'),
          (${definitions.foreign}, ${orgB}, null, 'application', 'text', 'Foreign'),
          (${definitions.empty}, ${orgA}, ${jobA}, 'application', 'text', 'Empty'),
          (${definitions.checkbox}, ${orgA}, ${jobA}, 'application', 'checkbox', 'Checkbox'),
          (${definitions.number}, ${orgA}, ${jobA}, 'application', 'number', 'Number'),
          (${definitions.multi}, ${orgA}, ${jobA}, 'application', 'multi_select', 'Multi')`

        const applicationIds: string[] = []
        for (let index = 0; index < 8; index += 1) {
          const candidateId = `property_${suffix}_candidate_${index}`
          const applicationId = `property_${suffix}_application_${index}`
          applicationIds.push(applicationId)
          await client`insert into "candidate"
            ("id", "organization_id", "first_name", "last_name", "email") values
            (${candidateId}, ${orgA}, 'Property', ${`Candidate ${index}`}, ${`property-${suffix}-${index}@example.com`})`
          await client`insert into "application"
            ("id", "organization_id", "candidate_id", "job_id") values
            (${applicationId}, ${orgA}, ${candidateId}, ${jobA})`
        }

        const insertValue = async (definitionId: string, entityId: string, value: postgres.SerializableParameter) => {
          await client`insert into "property_value"
            ("id", "organization_id", "property_definition_id", "entity_type", "entity_id", "value") values
            (${randomUUID()}, ${orgA}, ${definitionId}, 'application', ${entityId}, ${value}::jsonb)`
        }
        await insertValue(definitions.appJobA, applicationIds[0]!, JSON.stringify('Alpha 100%_\\Path'))
        await insertValue(definitions.appJobA, applicationIds[1]!, JSON.stringify('Alpha 100xxPath'))
        await insertValue(definitions.checkbox, applicationIds[0]!, 'false')
        await insertValue(definitions.checkbox, applicationIds[1]!, 'true')
        await insertValue(definitions.number, applicationIds[0]!, '0')
        await insertValue(definitions.number, applicationIds[1]!, '5')
        await insertValue(definitions.multi, applicationIds[0]!, JSON.stringify(['red', 'blue']))
        await insertValue(definitions.multi, applicationIds[1]!, JSON.stringify(['green']))
        await insertValue(definitions.empty, applicationIds[1]!, 'null')
        await client`insert into "property_value"
          ("id", "organization_id", "property_definition_id", "entity_type", "entity_id", "value") values
          (${randomUUID()}, ${orgA}, ${definitions.empty}, 'application', ${applicationIds[2]}, null)`
        await insertValue(definitions.empty, applicationIds[3]!, JSON.stringify(''))
        await insertValue(definitions.empty, applicationIds[4]!, JSON.stringify([]))
        await insertValue(definitions.empty, applicationIds[5]!, 'false')
        await insertValue(definitions.empty, applicationIds[6]!, '0')
        // applicationIds[0] and applicationIds[7] intentionally have no empty-property row.

        const loadDefinitions = (input: Parameters<typeof loadVisiblePropertyDefinitionIds>[0]) =>
          loadVisiblePropertyDefinitionIds(input, database)

        const visibilityCases = [
          { entityType: 'candidate' as const, jobId: undefined, valid: definitions.candidateGlobal, invalid: definitions.candidateJob },
          { entityType: 'application' as const, jobId: undefined, valid: definitions.appGlobal, invalid: definitions.appJobA },
          { entityType: 'application' as const, jobId: jobA, valid: definitions.appJobA, invalid: definitions.appJobB },
          { entityType: 'application' as const, jobId: jobA, valid: definitions.appGlobal, invalid: definitions.candidateGlobal },
          { entityType: 'application' as const, jobId: jobA, valid: definitions.appGlobal, invalid: definitions.foreign },
          { entityType: 'application' as const, jobId: jobA, valid: definitions.appGlobal, invalid: `property_${suffix}_unknown` },
        ]
        for (const visibility of visibilityCases) {
          await expect(validatePropertyFilterDefinitions({
            organizationId: orgA,
            entityType: visibility.entityType,
            jobId: visibility.jobId,
            filters: [{ propertyDefinitionId: visibility.valid, op: 'isNotEmpty' }],
          }, loadDefinitions)).resolves.toBeUndefined()
          await expect(validatePropertyFilterDefinitions({
            organizationId: orgA,
            entityType: visibility.entityType,
            jobId: visibility.jobId,
            filters: [{ propertyDefinitionId: visibility.invalid, op: 'isNotEmpty' }],
          }, loadDefinitions)).rejects.toMatchObject({
            statusCode: 400,
            statusMessage: 'Invalid propertyFilters',
          })
        }

        const queryApplications = async (filters: PropertyFilter[], page = 1, limit = 20) => {
          await validatePropertyFilterDefinitions({
            organizationId: orgA,
            entityType: 'application',
            jobId: jobA,
            filters,
          }, loadDefinitions)
          const propertyCondition = buildPropertyFiltersCondition({
            organizationId: orgA,
            entityType: 'application',
            entityIdColumn: schema.application.id,
            filters,
          })!
          const where = and(
            eq(schema.application.organizationId, orgA),
            eq(schema.application.jobId, jobA),
            propertyCondition,
          )
          const [rows, totals] = await Promise.all([
            database.select({ id: schema.application.id })
              .from(schema.application)
              .where(where)
              .orderBy(asc(schema.application.id))
              .limit(limit)
              .offset((page - 1) * limit),
            database.select({ total: count() }).from(schema.application).where(where),
          ])
          return { ids: rows.map(row => row.id), total: totals[0]?.total ?? 0, propertyCondition }
        }

        await expect(queryApplications([
          { propertyDefinitionId: definitions.appJobA, op: 'contains', value: '100%_\\Path' },
        ])).resolves.toMatchObject({ ids: [applicationIds[0]], total: 1 })
        await expect(queryApplications([
          { propertyDefinitionId: definitions.multi, op: 'contains', value: 'red' },
        ])).resolves.toMatchObject({ ids: [], total: 0 })
        await expect(queryApplications([
          { propertyDefinitionId: definitions.checkbox, op: 'equals', value: false },
          { propertyDefinitionId: definitions.number, op: 'equals', value: 0 },
          { propertyDefinitionId: definitions.multi, op: 'in', value: ['blue', 'violet'] },
        ])).resolves.toMatchObject({ ids: [applicationIds[0]], total: 1 })
        await expect(queryApplications([
          { propertyDefinitionId: definitions.empty, op: 'isEmpty' },
        ], 2, 3)).resolves.toMatchObject({
          ids: [applicationIds[3], applicationIds[4], applicationIds[7]],
          total: 6,
        })
        await expect(queryApplications([
          { propertyDefinitionId: definitions.empty, op: 'isNotEmpty' },
        ])).resolves.toMatchObject({ ids: [applicationIds[5], applicationIds[6]], total: 2 })

        await client`insert into "property_value"
          ("id", "organization_id", "property_definition_id", "entity_type", "entity_id", "value")
          select gen_random_uuid()::text, ${orgA}, ${definitions.appGlobal}, 'application',
            'filler-' || value::text, to_jsonb('filler'::text)
          from generate_series(1, 3000) value`
        await client`analyze "application"`
        await client`analyze "property_value"`

        const correlatedQuery = database
          .select({ id: schema.application.id })
          .from(schema.application)
          .where(and(
            eq(schema.application.organizationId, orgA),
            buildPropertyFiltersCondition({
              organizationId: orgA,
              entityType: 'application',
              entityIdColumn: schema.application.id,
              filters: [{ propertyDefinitionId: definitions.appJobA, op: 'contains', value: 'Alpha' }],
            }),
          ))
          .toSQL()
        const correlatedExplain = await client.unsafe<Array<Record<string, unknown>>>(
          `explain (analyze, buffers, format json) ${correlatedQuery.sql}`,
          correlatedQuery.params as postgres.SerializableParameter[],
        )
        const correlatedPlanNodes = collectPlanNodes(correlatedExplain)
        expect(correlatedPlanNodes.some(node =>
          node['Relation Name'] === 'property_value'
          && ['Index Scan', 'Index Only Scan', 'Bitmap Index Scan', 'Bitmap Heap Scan']
            .includes(String(node['Node Type'])),
        )).toBe(true)

        // Probe both leading columns directly to prove the existing unique
        // index remains usable; no additional migration is required.
        const explainQuery = database
          .select({ id: schema.propertyValue.id })
          .from(schema.propertyValue)
          .where(and(
            eq(schema.propertyValue.organizationId, orgA),
            eq(schema.propertyValue.entityType, 'application'),
            eq(schema.propertyValue.propertyDefinitionId, definitions.appJobA),
            eq(schema.propertyValue.entityId, applicationIds[0]!),
          ))
          .toSQL()
        const explained = await client.unsafe<Array<Record<string, unknown>>>(
          `explain (analyze, buffers, format json) ${explainQuery.sql}`,
          explainQuery.params as postgres.SerializableParameter[],
        )
        const planNodes = collectPlanNodes(explained)
        expect(planNodes.some(node =>
          node['Index Name'] === 'property_value_def_entity_idx'
          && ['Index Scan', 'Index Only Scan', 'Bitmap Index Scan'].includes(String(node['Node Type'])),
        )).toBe(true)
      }
      finally {
        await client.end()
      }
    }
    finally {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end()
    }
  }, 60_000)
})
