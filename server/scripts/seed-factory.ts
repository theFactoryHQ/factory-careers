/**
 * Seed the production launch organization and General Interest role.
 *
 * Usage: npx tsx server/scripts/seed-factory.ts
 * Requires DATABASE_URL in .env or shell env.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { and, eq } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '../database/schema'

const processWithLoadEnv = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void
}

if (!process.env.DATABASE_URL && typeof processWithLoadEnv.loadEnvFile === 'function') {
  try {
    processWithLoadEnv.loadEnvFile('.env')
  }
  catch {
    // .env is optional on hosted environments
  }
}

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it in .env or export it.')
  process.exit(1)
}

const FACTORY_ORG_ID = 'factory-org'
const FACTORY_JOB_ID = 'factory-general-interest'
const FACTORY_ORG_NAME = process.env.FACTORY_ORG_NAME || 'Factory'
const FACTORY_ORG_SLUG = process.env.FACTORY_ORG_SLUG || 'factory'
const FACTORY_ANALYSIS_CONTEXT = [
  'Factory is a multifamily office for athletes, entertainers, and founders.',
  'Factory provides advisory services and business management to help clients manage their lives, with additional offerings across private investment, media, entertainment, and brand work.',
  'Candidate analysis should consider relevance to this high-touch client-services business and its client base, in addition to the specific role requirements.',
].join(' ')

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client, { schema })

async function main() {
  await db
    .insert(schema.organization)
    .values({
      id: FACTORY_ORG_ID,
      name: FACTORY_ORG_NAME,
      slug: FACTORY_ORG_SLUG,
      logo: '/factory-logo.png',
      metadata: JSON.stringify({ source: 'factory-careers-seed' }),
    })
    .onConflictDoUpdate({
      target: schema.organization.slug,
      set: {
        name: FACTORY_ORG_NAME,
        logo: '/factory-logo.png',
        metadata: JSON.stringify({ source: 'factory-careers-seed' }),
      },
    })

  const [factoryOrg] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, FACTORY_ORG_SLUG))
    .limit(1)

  const factoryOrgId = factoryOrg?.id ?? FACTORY_ORG_ID

  const [factorySettings] = await db
    .select({
      id: schema.orgSettings.id,
      analysisContext: schema.orgSettings.analysisContext,
    })
    .from(schema.orgSettings)
    .where(eq(schema.orgSettings.organizationId, factoryOrgId))
    .limit(1)

  if (!factorySettings) {
    await db.insert(schema.orgSettings).values({
      organizationId: factoryOrgId,
      analysisContext: FACTORY_ANALYSIS_CONTEXT,
    })
  }
  else if (!factorySettings.analysisContext.trim()) {
    await db
      .update(schema.orgSettings)
      .set({
        analysisContext: FACTORY_ANALYSIS_CONTEXT,
        updatedAt: new Date(),
      })
      .where(eq(schema.orgSettings.id, factorySettings.id))
  }

  await db
    .insert(schema.job)
    .values({
      id: FACTORY_JOB_ID,
      organizationId: factoryOrgId,
      title: 'General Interest',
      slug: 'general-interest',
      description: [
        'Factory is always interested in meeting thoughtful builders, operators, strategists, and collaborators.',
        '',
        'Use this opening to introduce yourself, share the kind of work you want to do, and upload a resume or work summary. We review general interest submissions as needs emerge across Factory and its portfolio.',
      ].join('\n'),
      location: 'Remote / United States',
      type: 'full_time',
      status: 'open',
      remoteStatus: 'remote',
      salaryNegotiable: true,
      requireResume: true,
      requireCoverLetter: false,
      autoScoreOnApply: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.job.slug,
      set: {
        organizationId: factoryOrgId,
        title: 'General Interest',
        description: [
          'Factory is always interested in meeting thoughtful builders, operators, strategists, and collaborators.',
          '',
          'Use this opening to introduce yourself, share the kind of work you want to do, and upload a resume or work summary. We review general interest submissions as needs emerge across Factory and its portfolio.',
        ].join('\n'),
        location: 'Remote / United States',
        type: 'full_time',
        status: 'open',
        remoteStatus: 'remote',
        salaryNegotiable: true,
        requireResume: true,
        requireCoverLetter: false,
        autoScoreOnApply: true,
        updatedAt: new Date(),
      },
    })

  const [factoryJob] = await db
    .select({ id: schema.job.id })
    .from(schema.job)
    .where(eq(schema.job.slug, 'general-interest'))
    .limit(1)

  const factoryJobId = factoryJob?.id ?? FACTORY_JOB_ID

  await db
    .delete(schema.jobQuestion)
    .where(and(
      eq(schema.jobQuestion.organizationId, factoryOrgId),
      eq(schema.jobQuestion.jobId, factoryJobId),
    ))

  await db.insert(schema.jobQuestion).values([
    {
      organizationId: factoryOrgId,
      jobId: factoryJobId,
      type: 'long_text',
      label: 'What kind of work are you interested in doing with Factory?',
      required: true,
      displayOrder: 0,
    },
    {
      organizationId: factoryOrgId,
      jobId: factoryJobId,
      type: 'url',
      label: 'LinkedIn, portfolio, GitHub, or personal site',
      required: false,
      displayOrder: 1,
    },
    {
      organizationId: factoryOrgId,
      jobId: factoryJobId,
      type: 'long_text',
      label: 'Anything else you want us to know?',
      required: false,
      displayOrder: 2,
    },
  ])

  console.info('Seeded Factory organization and General Interest role.')
}

main()
  .catch((error) => {
    console.error('Factory seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end()
  })
