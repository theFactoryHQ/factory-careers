import { eq } from 'drizzle-orm'
import { orgSettings } from '../../database/schema'
import { updateOrgSettingsSchema } from '../../utils/schemas/orgSettings'
import { assertSignupDomainAllowlistUpdateAllowed, hasSignupAllowedDomainsColumn } from '../../utils/signupDomainAllowlist'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, updateOrgSettingsSchema.parse)
  const includeSignupAllowedDomains = await hasSignupAllowedDomainsColumn()

  if (body.signupAllowedDomains !== undefined && !includeSignupAllowedDomains) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Signup domain allowlists are pending a database migration.',
    })
  }

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
      ...(includeSignupAllowedDomains && { signupAllowedDomains: body.signupAllowedDomains ?? [] }),
    })
    .onConflictDoUpdate({
      target: orgSettings.organizationId,
      set: {
        ...(body.nameDisplayFormat !== undefined && { nameDisplayFormat: body.nameDisplayFormat }),
        ...(body.dateFormat !== undefined && { dateFormat: body.dateFormat }),
        ...(body.calendarSyncInterviewers !== undefined && { calendarSyncInterviewers: body.calendarSyncInterviewers }),
        ...(body.defaultSalaryUnit !== undefined && { defaultSalaryUnit: body.defaultSalaryUnit }),
        ...(includeSignupAllowedDomains && body.signupAllowedDomains !== undefined && { signupAllowedDomains: body.signupAllowedDomains }),
        updatedAt: new Date(),
      },
    })
    .returning(includeSignupAllowedDomains
      ? {
          nameDisplayFormat: orgSettings.nameDisplayFormat,
          dateFormat: orgSettings.dateFormat,
          calendarSyncInterviewers: orgSettings.calendarSyncInterviewers,
          defaultSalaryUnit: orgSettings.defaultSalaryUnit,
          signupAllowedDomains: orgSettings.signupAllowedDomains,
        }
      : {
          nameDisplayFormat: orgSettings.nameDisplayFormat,
          dateFormat: orgSettings.dateFormat,
          calendarSyncInterviewers: orgSettings.calendarSyncInterviewers,
          defaultSalaryUnit: orgSettings.defaultSalaryUnit,
        })

  if (!result) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to save settings' })
  }

  logApiRequest(event, session, 'org_settings.updated', {})

  return {
    ...result,
    signupAllowedDomains: 'signupAllowedDomains' in result ? result.signupAllowedDomains : [],
  }
})
