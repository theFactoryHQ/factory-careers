import { eq, and, sql, count, gte, lte, desc } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { emptyPipelineCounts } from '~~/shared/application-status'
import {
  applicationSource,
  application,
  trackingLink,
  job,
  candidate,
} from '../database/schema'
import type { sourceStatsQuerySchema } from './schemas/trackingLink'
import type { z } from 'zod'

export type SourceStatsQuery = z.infer<typeof sourceStatsQuerySchema>

type StatusByChannelRow = {
  channel: string
  status: string
  count: number
}

type StatusBreakdownRow = {
  status: string
  count: number
}

/** Build org-scoped date filter conditions for application source analytics. */
export function buildOrgSourceDateConditions(
  orgId: string,
  query: SourceStatsQuery,
): SQL[] {
  const conditions: SQL[] = [eq(applicationSource.organizationId, orgId)]

  if (query.jobId) {
    conditions.push(eq(application.jobId, query.jobId))
  }
  if (query.from) {
    conditions.push(gte(applicationSource.createdAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(applicationSource.createdAt, new Date(query.to)))
  }

  return conditions
}

/** Build tracking-link-scoped date filter conditions for application source analytics. */
export function buildTrackingLinkDateConditions(
  trackingLinkId: string,
  query: SourceStatsQuery,
): SQL[] {
  const conditions: SQL[] = [eq(applicationSource.trackingLinkId, trackingLinkId)]

  if (query.from) {
    conditions.push(gte(applicationSource.createdAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(applicationSource.createdAt, new Date(query.to)))
  }

  return conditions
}

/** Build conversion funnel map: channel → status → count. */
export function buildChannelFunnel(
  statusByChannel: StatusByChannelRow[],
): Record<string, Record<string, number>> {
  const funnel: Record<string, Record<string, number>> = {}

  for (const row of statusByChannel) {
    if (!funnel[row.channel]) {
      funnel[row.channel] = emptyPipelineCounts()
    }
    funnel[row.channel]![row.status] = row.count
  }

  return funnel
}

/** Build a single-status funnel map from status breakdown rows. */
export function buildStatusFunnel(
  statusBreakdown: StatusBreakdownRow[],
): Record<string, number> {
  const funnel: Record<string, number> = emptyPipelineCounts()

  for (const row of statusBreakdown) {
    funnel[row.status] = row.count
  }

  return funnel
}

/** Compute attribution summary for an organization. */
export function buildAttributionSummary(totalTracked: number, totalUntracked: number) {
  return {
    totalTracked,
    totalUntracked,
    attributionRate: totalTracked + totalUntracked > 0
      ? Math.round((totalTracked / (totalTracked + totalUntracked)) * 100)
      : 0,
  }
}

/** Compute click-to-application conversion rate for a tracking link. */
export function computeTrackingLinkCvr(clickCount: number, applicationCount: number): number {
  return clickCount > 0
    ? Math.round((applicationCount / clickCount) * 100)
    : 0
}

/**
 * Fetch comprehensive source analytics for an organization.
 * Used by GET /api/source-tracking/stats.
 */
export async function fetchOrgSourceAnalytics(orgId: string, query: SourceStatsQuery) {
  const dateConditions = buildOrgSourceDateConditions(orgId, query)
  const whereClause = and(...dateConditions)

  const [
    channelBreakdown,
    topLinks,
    statusByChannel,
    dailyTrend,
    recentAttributed,
    totalTracked,
    totalUntracked,
    topReferrerDomains,
  ] = await Promise.all([
    db
      .select({
        channel: applicationSource.channel,
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(whereClause)
      .groupBy(applicationSource.channel)
      .orderBy(sql`count(*) desc`),

    db
      .select({
        id: trackingLink.id,
        name: trackingLink.name,
        channel: trackingLink.channel,
        code: trackingLink.code,
        jobTitle: job.title,
        clickCount: trackingLink.clickCount,
        applicationCount: trackingLink.applicationCount,
        isActive: trackingLink.isActive,
      })
      .from(trackingLink)
      .leftJoin(job, eq(job.id, trackingLink.jobId))
      .where(eq(trackingLink.organizationId, orgId))
      .orderBy(desc(trackingLink.applicationCount))
      .limit(10),

    db
      .select({
        channel: applicationSource.channel,
        status: application.status,
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(whereClause)
      .groupBy(applicationSource.channel, application.status),

    db
      .select({
        date: sql<string>`date_trunc('day', ${applicationSource.createdAt})::date`.as('day'),
        channel: applicationSource.channel,
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(and(
        ...dateConditions,
        gte(applicationSource.createdAt, sql`now() - interval '30 days'`),
      ))
      .groupBy(sql`date_trunc('day', ${applicationSource.createdAt})::date`, applicationSource.channel)
      .orderBy(sql`date_trunc('day', ${applicationSource.createdAt})::date`),

    db
      .select({
        applicationId: applicationSource.applicationId,
        jobId: application.jobId,
        channel: applicationSource.channel,
        utmSource: applicationSource.utmSource,
        utmCampaign: applicationSource.utmCampaign,
        referrerDomain: applicationSource.referrerDomain,
        trackingLinkName: trackingLink.name,
        candidateFirstName: candidate.firstName,
        candidateLastName: candidate.lastName,
        candidateEmail: candidate.email,
        jobTitle: job.title,
        status: application.status,
        appliedAt: applicationSource.createdAt,
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .leftJoin(trackingLink, eq(trackingLink.id, applicationSource.trackingLinkId))
      .where(whereClause)
      .orderBy(desc(applicationSource.createdAt))
      .limit(200),

    db.$count(applicationSource, eq(applicationSource.organizationId, orgId)),

    db.execute(sql`
      SELECT count(*) as count
      FROM ${application} a
      WHERE a.organization_id = ${orgId}
        AND NOT EXISTS (
          SELECT 1 FROM ${applicationSource} s
          WHERE s.application_id = a.id
        )
    `).then((r: any) => Number(r[0]?.count ?? 0)),

    db
      .select({
        domain: applicationSource.referrerDomain,
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(and(
        ...dateConditions,
        sql`${applicationSource.referrerDomain} IS NOT NULL`,
      ))
      .groupBy(applicationSource.referrerDomain)
      .orderBy(sql`count(*) desc`)
      .limit(10),
  ])

  return {
    channelBreakdown,
    topLinks,
    funnel: buildChannelFunnel(statusByChannel),
    dailyTrend,
    recentAttributed,
    topReferrerDomains,
    summary: buildAttributionSummary(totalTracked, totalUntracked),
  }
}

type TrackingLinkAnalyticsInput = {
  id: string
  name: string
  channel: string
  code: string
  jobId: string | null
  jobTitle: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
  clickCount: number
  applicationCount: number
  isActive: boolean
  createdAt: Date
}

/**
 * Fetch detailed analytics for a single tracking link.
 * Used by GET /api/tracking-links/:id/stats.
 */
export async function fetchTrackingLinkSourceAnalytics(
  link: TrackingLinkAnalyticsInput,
  query: SourceStatsQuery,
) {
  const dateConditions = buildTrackingLinkDateConditions(link.id, query)
  const whereClause = and(...dateConditions)

  const [
    statusBreakdown,
    dailyTrend,
    attributedApplications,
    referrerDomains,
    totalAttributed,
  ] = await Promise.all([
    db
      .select({
        status: application.status,
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(whereClause)
      .groupBy(application.status),

    db
      .select({
        date: sql<string>`date_trunc('day', ${applicationSource.createdAt})::date`.as('day'),
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(whereClause)
      .groupBy(sql`date_trunc('day', ${applicationSource.createdAt})::date`)
      .orderBy(sql`date_trunc('day', ${applicationSource.createdAt})::date`),

    db
      .select({
        applicationId: applicationSource.applicationId,
        channel: applicationSource.channel,
        utmSource: applicationSource.utmSource,
        utmMedium: applicationSource.utmMedium,
        utmCampaign: applicationSource.utmCampaign,
        utmTerm: applicationSource.utmTerm,
        utmContent: applicationSource.utmContent,
        referrerDomain: applicationSource.referrerDomain,
        candidateFirstName: candidate.firstName,
        candidateLastName: candidate.lastName,
        candidateEmail: candidate.email,
        jobTitle: job.title,
        jobId: application.jobId,
        status: application.status,
        appliedAt: applicationSource.createdAt,
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(whereClause)
      .orderBy(desc(applicationSource.createdAt))
      .limit(100),

    db
      .select({
        domain: applicationSource.referrerDomain,
        count: count().as('count'),
      })
      .from(applicationSource)
      .innerJoin(application, eq(application.id, applicationSource.applicationId))
      .where(and(
        ...dateConditions,
        sql`${applicationSource.referrerDomain} IS NOT NULL`,
      ))
      .groupBy(applicationSource.referrerDomain)
      .orderBy(sql`count(*) desc`)
      .limit(10),

    db.$count(applicationSource, eq(applicationSource.trackingLinkId, link.id)),
  ])

  return {
    link: {
      id: link.id,
      name: link.name,
      channel: link.channel,
      code: link.code,
      jobId: link.jobId,
      jobTitle: link.jobTitle,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
      utmTerm: link.utmTerm,
      utmContent: link.utmContent,
      clickCount: link.clickCount,
      applicationCount: link.applicationCount,
      isActive: link.isActive,
      createdAt: link.createdAt,
      cvr: computeTrackingLinkCvr(link.clickCount, link.applicationCount),
    },
    funnel: buildStatusFunnel(statusBreakdown),
    dailyTrend,
    attributedApplications,
    referrerDomains,
    totalAttributed,
  }
}