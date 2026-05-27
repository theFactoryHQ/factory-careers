import type { SQL } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { job, organization } from '../database/schema'

export async function getPublicJobScopeCondition(): Promise<SQL | undefined> {
  if (!env.FACTORY_DISABLE_PUBLIC_ORG_CREATION) return undefined

  const factoryOrg = await db.query.organization.findFirst({
    where: eq(organization.slug, env.FACTORY_ORG_SLUG),
    columns: { id: true },
  })

  if (!factoryOrg) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Factory organization is not configured.',
    })
  }

  return eq(job.organizationId, factoryOrg.id)
}
