import { eq } from 'drizzle-orm'
import { orgSettings } from '../../database/schema'
import { hasPostgresErrorCode } from '../../utils/signupDomainAllowlist'
import { DEFAULT_SCORING_BANDS, type ScoringBand } from '~~/shared/scoring-bands'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['read'] })
  const orgId = session.session.activeOrganizationId

  let settings: {
    nameDisplayFormat: 'first_last' | 'last_first'
    dateFormat: 'mdy' | 'dmy' | 'ymd'
    defaultSalaryUnit: string
    analysisContext?: string
    scoringBands?: ScoringBand[]
    signupAllowedDomains?: string[]
    applicationComplianceEnabled?: boolean
    includeEeo?: boolean
    includeVeteran?: boolean
    includeDisability?: boolean
    sendApplicationAcknowledgement?: boolean
    applicationAcknowledgementTemplateId?: string | null
    applicationAcknowledgementDelayMinutes?: number
    applicationAcknowledgementBusinessHoursOnly?: boolean
    sendApplicationRejection?: boolean
    applicationRejectionTemplateId?: string | null
    applicationRejectionDelayMinutes?: number
    applicationRejectionBusinessHoursOnly?: boolean
    interviewInvitationTemplateId?: string | null
    emailBusinessHoursTimezone?: string
    emailBusinessHoursStartHour?: number
    emailBusinessHoursEndHour?: number
  } | undefined

  try {
    settings = await db.query.orgSettings.findFirst({
      where: eq(orgSettings.organizationId, orgId),
      columns: {
        nameDisplayFormat: true,
        dateFormat: true,
        defaultSalaryUnit: true,
        analysisContext: true,
        scoringBands: true,
        signupAllowedDomains: true,
        applicationComplianceEnabled: true,
        includeEeo: true,
        includeVeteran: true,
        includeDisability: true,
        sendApplicationAcknowledgement: true,
        applicationAcknowledgementTemplateId: true,
        applicationAcknowledgementDelayMinutes: true,
        applicationAcknowledgementBusinessHoursOnly: true,
        sendApplicationRejection: true,
        applicationRejectionTemplateId: true,
        applicationRejectionDelayMinutes: true,
        applicationRejectionBusinessHoursOnly: true,
        interviewInvitationTemplateId: true,
        emailBusinessHoursTimezone: true,
        emailBusinessHoursStartHour: true,
        emailBusinessHoursEndHour: true,
      },
    })
  }
  catch (error) {
    if (hasPostgresErrorCode(error, '42703')) {
      settings = await db.query.orgSettings.findFirst({
        where: eq(orgSettings.organizationId, orgId),
        columns: {
          nameDisplayFormat: true,
          dateFormat: true,
          defaultSalaryUnit: true,
        },
      })
    }
    else {
      throw error
    }
  }

  // Return defaults if no settings row exists yet
  return {
    nameDisplayFormat: settings?.nameDisplayFormat ?? 'first_last',
    dateFormat: settings?.dateFormat ?? 'mdy',
    defaultSalaryUnit: settings?.defaultSalaryUnit ?? 'YEAR',
    analysisContext: settings?.analysisContext ?? '',
    scoringBands: settings?.scoringBands ?? DEFAULT_SCORING_BANDS,
    signupAllowedDomains: settings?.signupAllowedDomains ?? [],
    applicationComplianceEnabled: settings?.applicationComplianceEnabled ?? true,
    includeEeo: settings?.includeEeo ?? true,
    includeVeteran: settings?.includeVeteran ?? true,
    includeDisability: settings?.includeDisability ?? true,
    sendApplicationAcknowledgement: settings?.sendApplicationAcknowledgement ?? true,
    applicationAcknowledgementTemplateId: settings?.applicationAcknowledgementTemplateId ?? null,
    applicationAcknowledgementDelayMinutes: settings?.applicationAcknowledgementDelayMinutes ?? 0,
    applicationAcknowledgementBusinessHoursOnly: settings?.applicationAcknowledgementBusinessHoursOnly ?? false,
    sendApplicationRejection: settings?.sendApplicationRejection ?? false,
    applicationRejectionTemplateId: settings?.applicationRejectionTemplateId ?? null,
    applicationRejectionDelayMinutes: settings?.applicationRejectionDelayMinutes ?? 0,
    applicationRejectionBusinessHoursOnly: settings?.applicationRejectionBusinessHoursOnly ?? false,
    interviewInvitationTemplateId: settings?.interviewInvitationTemplateId ?? null,
    emailBusinessHoursTimezone: settings?.emailBusinessHoursTimezone ?? 'America/New_York',
    emailBusinessHoursStartHour: settings?.emailBusinessHoursStartHour ?? 9,
    emailBusinessHoursEndHour: settings?.emailBusinessHoursEndHour ?? 17,
  }
})
