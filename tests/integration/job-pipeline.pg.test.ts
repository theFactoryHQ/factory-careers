import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'
import { loadJobPipeline } from '../../server/utils/jobPipeline'
import { jobPipelineQuerySchema } from '../../server/utils/schemas/jobPipeline'

const adminUrl = process.env.JOB_PIPELINE_PG_TEST_URL
  ?? process.env.PROPERTY_FILTER_PG_TEST_URL
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

describeWithPostgres('job pipeline on PostgreSQL', () => {
  it('enforces tenant scope and server filters before stable bounded pagination', async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const databaseName = `careers_pipeline_${suffix}`

    try {
      await admin.unsafe(`create database "${databaseName}"`)
      const client = postgres(databaseUrl(databaseName), { max: 4, onnotice: () => undefined })
      const database = drizzle(client, { schema })

      try {
        await migrate(database, { migrationsFolder })
        const orgA = `pipeline_${suffix}_org_a`
        const orgB = `pipeline_${suffix}_org_b`
        const jobA = `pipeline_${suffix}_job_a`
        const jobB = `pipeline_${suffix}_job_b`
        const userId = `pipeline_${suffix}_user`
        await client`insert into "organization" ("id", "name", "slug") values
          (${orgA}, 'Pipeline A', ${`pipeline-${suffix}-a`}),
          (${orgB}, 'Pipeline B', ${`pipeline-${suffix}-b`})`
        await client`insert into "user" ("id", "name", "email") values
          (${userId}, 'Pipeline User', ${`pipeline-${suffix}@example.com`})`
        await client`insert into "job" ("id", "organization_id", "title", "slug") values
          (${jobA}, ${orgA}, 'Pipeline Job A', ${`pipeline-${suffix}-job-a`}),
          (${jobB}, ${orgB}, 'Pipeline Job B', ${`pipeline-${suffix}-job-b`})`

        const applications = [
          { id: `pipeline_${suffix}_app_a`, first: 'Ada', last: 'Alpha', status: 'new', score: 90 },
          { id: `pipeline_${suffix}_app_b`, first: 'Bea', last: 'Beta', status: 'new', score: 90 },
          { id: `pipeline_${suffix}_app_c`, first: 'Cy', last: 'Gamma', status: 'new', score: null },
          { id: `pipeline_${suffix}_app_d`, first: 'Dee', last: 'Delta', status: 'screening', score: 80 },
          { id: `pipeline_${suffix}_app_e`, first: 'Eve', last: 'Epsilon', status: 'interview', score: 30 },
        ] as const
        for (const [index, item] of applications.entries()) {
          const candidateId = `pipeline_${suffix}_candidate_${index}`
          await client`insert into "candidate"
            ("id", "organization_id", "first_name", "last_name", "email") values
            (${candidateId}, ${orgA}, ${item.first}, ${item.last}, ${`${item.first.toLowerCase()}-${suffix}@example.com`})`
          await client`insert into "application"
            ("id", "organization_id", "candidate_id", "job_id", "status", "score", "notes") values
            (${item.id}, ${orgA}, ${candidateId}, ${jobA}, ${item.status}, ${item.score}, ${index === 1 ? 'Needle portfolio' : null})`
        }

        const foreignCandidate = `pipeline_${suffix}_foreign_candidate`
        await client`insert into "candidate"
          ("id", "organization_id", "first_name", "last_name", "email") values
          (${foreignCandidate}, ${orgB}, 'Foreign', 'Candidate', ${`foreign-${suffix}@example.com`})`
        await client`insert into "application"
          ("id", "organization_id", "candidate_id", "job_id", "status", "score") values
          (${`pipeline_${suffix}_foreign_app`}, ${orgB}, ${foreignCandidate}, ${jobB}, 'new', 100)`

        await client`insert into "interview"
          ("id", "organization_id", "application_id", "title", "status", "scheduled_at", "created_by_id") values
          (${`pipeline_${suffix}_scheduled`}, ${orgA}, ${applications[0].id}, 'Scheduled', 'scheduled', now(), ${userId}),
          (${`pipeline_${suffix}_completed`}, ${orgA}, ${applications[1].id}, 'Completed', 'completed', now(), ${userId})`

        const propertyDefinitionId = `pipeline_${suffix}_property`
        await client`insert into "property_definition"
          ("id", "organization_id", "job_id", "entity_type", "type", "name") values
          (${propertyDefinitionId}, ${orgA}, ${jobA}, 'application', 'text', 'Track')`
        await client`insert into "property_value"
          ("id", "organization_id", "property_definition_id", "entity_type", "entity_id", "value") values
          (${randomUUID()}, ${orgA}, ${propertyDefinitionId}, 'application', ${applications[0].id}, ${JSON.stringify('priority')}::jsonb)`

        const load = (rawQuery: Record<string, unknown>) => loadJobPipeline({
          organizationId: orgA,
          jobId: jobA,
          query: jobPipelineQuerySchema.parse(rawQuery),
        }, database)

        await expect(loadJobPipeline({
          organizationId: orgA,
          jobId: jobB,
          query: jobPipelineQuerySchema.parse({}),
        }, database)).resolves.toBeNull()

        const descending = await load({ stage: 'new', sort: 'score-desc', limit: 2 })
        expect(descending).toMatchObject({
          total: 3,
          page: 1,
          limit: 2,
          stageCounts: { new: 3, screening: 1, interview: 1, offer: 0, hired: 0, rejected: 0 },
        })
        expect(descending?.data.map(row => row.id)).toEqual([applications[0].id, applications[1].id])
        expect(descending?.data[0]).toMatchObject({ hasScheduledInterview: true })
        expect(descending?.data[0]?.properties).toHaveLength(1)

        const ascending = await load({ stage: 'new', sort: 'score-asc', limit: 5 })
        expect(ascending?.data.map(row => row.id)).toEqual([
          applications[0].id,
          applications[1].id,
          applications[2].id,
        ])
        expect(ascending?.data.at(-1)?.score).toBeNull()

        await expect(load({ stage: 'screening', score: 'high' })).resolves.toMatchObject({
          total: 1,
          stageCounts: { new: 2, screening: 1, interview: 0, offer: 0, hired: 0, rejected: 0 },
        })
        await expect(load({ stage: 'new', candidateSearch: 'Ada' })).resolves.toMatchObject({
          total: 1,
          data: [{ id: applications[0].id }],
        })
        await expect(load({ stage: 'new', search: 'Needle' })).resolves.toMatchObject({
          total: 1,
          data: [{ id: applications[1].id }],
        })
        await expect(load({ stage: 'new', interviews: 'has-interview' })).resolves.toMatchObject({
          total: 1,
          data: [{ id: applications[0].id }],
        })
        await expect(load({ stage: 'new', interviews: 'no-interview' })).resolves.toMatchObject({ total: 2 })
        await expect(load({
          stage: 'new',
          propertyFilters: JSON.stringify([{ propertyDefinitionId, op: 'equals', value: 'priority' }]),
        })).resolves.toMatchObject({ total: 1, data: [{ id: applications[0].id }] })

        // Probe the existing job index with the same leading tenant/job/stage
        // shape before considering any new pipeline-specific index.
        await client`insert into "candidate"
          ("id", "organization_id", "first_name", "last_name", "email")
          select ${`pipeline_${suffix}_filler_candidate_`} || value::text, ${orgA}, 'Filler', value::text,
            ${`pipeline-${suffix}-filler-`} || value::text || '@example.com'
          from generate_series(1, 1500) value`
        await client`insert into "application"
          ("id", "organization_id", "candidate_id", "job_id", "status")
          select ${`pipeline_${suffix}_filler_app_`} || value::text, ${orgA},
            ${`pipeline_${suffix}_filler_candidate_`} || value::text, ${jobA}, 'rejected'
          from generate_series(1, 1500) value`
        await client`analyze "application"`
        await client`set enable_seqscan = off`
        const explained = await client<Array<Record<string, unknown>>>`
          explain (analyze, buffers, format json)
          select id from "application"
          where "organization_id" = ${orgA} and "job_id" = ${jobA} and "status" = 'new'
          order by "score" desc nulls last, "id" asc limit 25`
        const planNodes = collectPlanNodes(explained)
        expect(planNodes.some(node =>
          node['Index Name'] === 'application_job_id_idx'
          && ['Index Scan', 'Bitmap Index Scan'].includes(String(node['Node Type'])),
        )).toBe(true)
      } finally {
        await client.end()
      }
    } finally {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end()
    }
  }, 60_000)
})
