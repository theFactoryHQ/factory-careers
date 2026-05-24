import { eq } from 'drizzle-orm'
import { orgSettings } from '../../database/schema'
import { updateOrgSettingsSchema } from '../../utils/schemas/orgSettings'
import { assertSignupDomainAllowlistUpdateAllowed } from '../../utils/signupDomainAllowlist'

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
      signupAllowedDomains: body.signupAllowedDomains ?? [],
    })
    .onConflictDoUpdate({
      target: orgSettings.organizationId,
      set: {
        ...(body.nameDisplayFormat !== undefined && { nameDisplayFormat: body.nameDisplayFormat }),
        ...(body.dateFormat !== undefined && { dateFormat: body.dateFormat }),
        ...(body.calendarSyncInterviewers !== undefined && { calendarSyncInterviewers: body.calendarSyncInterviewers }),
        ...(body.defaultSalaryUnit !== undefined && { defaultSalaryUnit: body.defaultSalaryUnit }),
        ...(body.signupAllowedDomains !== undefined && { signupAllowedDomains: body.signupAllowedDomains }),
        updatedAt: new Date(),
      },
    })
    .returning({
      nameDisplayFormat: orgSettings.nameDisplayFormat,
      dateFormat: orgSettings.dateFormat,
      calendarSyncInterviewers: orgSettings.calendarSyncInterviewers,
      defaultSalaryUnit: orgSettings.defaultSalaryUnit,
      signupAllowedDomains: orgSettings.signupAllowedDomains,
    })

  if (!result) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to save settings' })
  }

  logApiRequest(event, session, 'org_settings.updated', {})

  return result
})
