import { count, eq, sql } from 'drizzle-orm'
import { applicationComplianceResponse } from '../../../database/schema'

/**
 * GET /api/compliance/applications/summary
 * Dashboard-only aggregate compliance reporting for the active organization.
 * Returns grouped counts only; individual self-identification answers are not
 * exposed to ordinary candidate/application evaluation surfaces.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId

  const [totalResponses, sex, raceEthnicity, veteranStatus, disabilityStatus] = await Promise.all([
    db.$count(applicationComplianceResponse, eq(applicationComplianceResponse.organizationId, orgId)),
    db
      .select({
        value: applicationComplianceResponse.sex,
        count: count().as('count'),
      })
      .from(applicationComplianceResponse)
      .where(eq(applicationComplianceResponse.organizationId, orgId))
      .groupBy(applicationComplianceResponse.sex)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        value: applicationComplianceResponse.raceEthnicity,
        count: count().as('count'),
      })
      .from(applicationComplianceResponse)
      .where(eq(applicationComplianceResponse.organizationId, orgId))
      .groupBy(applicationComplianceResponse.raceEthnicity)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        value: applicationComplianceResponse.veteranStatus,
        count: count().as('count'),
      })
      .from(applicationComplianceResponse)
      .where(eq(applicationComplianceResponse.organizationId, orgId))
      .groupBy(applicationComplianceResponse.veteranStatus)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        value: applicationComplianceResponse.disabilityStatus,
        count: count().as('count'),
      })
      .from(applicationComplianceResponse)
      .where(eq(applicationComplianceResponse.organizationId, orgId))
      .groupBy(applicationComplianceResponse.disabilityStatus)
      .orderBy(sql`count(*) desc`),
  ])

  return {
    jurisdiction: 'US',
    formVersion: 'US-SELF-ID-2026-05',
    totalResponses,
    breakdowns: {
      sex: omitNullBuckets(sex),
      raceEthnicity: omitNullBuckets(raceEthnicity),
      veteranStatus: omitNullBuckets(veteranStatus),
      disabilityStatus: omitNullBuckets(disabilityStatus),
    },
  }
})

function omitNullBuckets(rows: Array<{ value: string | null; count: number }>) {
  return rows.filter((row) => row.value !== null)
}
