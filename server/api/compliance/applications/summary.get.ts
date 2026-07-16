import { count, eq, sql } from 'drizzle-orm'
import { applicationComplianceResponse } from '../../../database/schema'
import { protectComplianceReporting } from '../../../utils/complianceReporting'

/**
 * GET /api/compliance/applications/summary
 * Owner/admin-only aggregate compliance reporting for the active organization.
 * Returns grouped counts only; individual self-identification answers are not
 * exposed to ordinary candidate/application evaluation surfaces.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
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

  const protectedReporting = protectComplianceReporting(totalResponses, {
    sex,
    raceEthnicity,
    veteranStatus,
    disabilityStatus,
  })

  return {
    jurisdiction: 'US',
    formVersion: 'US-SELF-ID-2026-05',
    totalResponses: protectedReporting.totalResponses,
    suppressed: protectedReporting.suppressed,
    minimumCohortSize: protectedReporting.minimumCohortSize,
    breakdowns: protectedReporting.breakdowns,
  }
})
