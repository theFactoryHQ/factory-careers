import { eq } from 'drizzle-orm'
import { orgSettings } from '../../database/schema'
import { updateOrgSettingsSchema } from '../../utils/schemas/orgSettings'
import { assertSignupDomainAllowlistUpdateAllowed } from '../../utils/signupDomainAllowlist'
import { DEFAULT_SCORING_BANDS } from '~~/shared/scoring-bands'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, updateOrgSettingsSchema.parse)

  if (body.signupAllowedDomains !== undefined) {
    await assertSignupDomainAllowlistUpdateAllowed({
      actorUserId: session.user.id,
      organizationId: orgId,
      domains: body.signupAllowedDomains,
    })
  }

  // Upsert: insert or update on conflict
  const [result] = await db
    .insert(orgSettings)
    .values({
      organizationId: orgId,
      nameDisplayFormat: body.nameDisplayFormat ?? 'first_last',
      dateFormat: body.dateFormat ?? 'mdy',
      calendarSyncInterviewers: body.calendarSyncInterviewers ?? false,
      defaultSalaryUnit: body.defaultSalaryUnit ?? 'YEAR',
      analysisContext: body.analysisContext ?? '',
      scoringBands: body.scoringBands ?? DEFAULT_SCORING_BANDS,
      signupAllowedDomains: body.signupAllowedDomains ?? [],
      applicationComplianceEnabled: body.applicationComplianceEnabled ?? true,
      includeEeo: body.includeEeo ?? true,
      includeVeteran: body.includeVeteran ?? true,
      includeDisability: body.includeDisability ?? true,
    })
    .onConflictDoUpdate({
      target: orgSettings.organizationId,
      set: {
        ...(body.nameDisplayFormat !== undefined && { nameDisplayFormat: body.nameDisplayFormat }),
        ...(body.dateFormat !== undefined && { dateFormat: body.dateFormat }),
        ...(body.calendarSyncInterviewers !== undefined && { calendarSyncInterviewers: body.calendarSyncInterviewers }),
        ...(body.defaultSalaryUnit !== undefined && { defaultSalaryUnit: body.defaultSalaryUnit }),
        ...(body.analysisContext !== undefined && { analysisContext: body.analysisContext }),
        ...(body.scoringBands !== undefined && { scoringBands: body.scoringBands }),
        ...(body.signupAllowedDomains !== undefined && { signupAllowedDomains: body.signupAllowedDomains }),
        ...(body.applicationComplianceEnabled !== undefined && { applicationComplianceEnabled: body.applicationComplianceEnabled }),
        ...(body.includeEeo !== undefined && { includeEeo: body.includeEeo }),
        ...(body.includeVeteran !== undefined && { includeVeteran: body.includeVeteran }),
        ...(body.includeDisability !== undefined && { includeDisability: body.includeDisability }),
        updatedAt: new Date(),
      },
    })
    .returning({
      nameDisplayFormat: orgSettings.nameDisplayFormat,
      dateFormat: orgSettings.dateFormat,
      calendarSyncInterviewers: orgSettings.calendarSyncInterviewers,
      defaultSalaryUnit: orgSettings.defaultSalaryUnit,
      analysisContext: orgSettings.analysisContext,
      scoringBands: orgSettings.scoringBands,
      signupAllowedDomains: orgSettings.signupAllowedDomains,
      applicationComplianceEnabled: orgSettings.applicationComplianceEnabled,
      includeEeo: orgSettings.includeEeo,
      includeVeteran: orgSettings.includeVeteran,
      includeDisability: orgSettings.includeDisability,
    })

  if (!result) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to save settings' })
  }

  logApiRequest(event, session, 'org_settings.updated', {})

  return result
})
