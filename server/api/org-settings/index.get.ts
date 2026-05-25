import { eq } from 'drizzle-orm'
import { orgSettings } from '../../database/schema'
import { hasPostgresErrorCode } from '../../utils/signupDomainAllowlist'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['read'] })
  const orgId = session.session.activeOrganizationId

  let settings: {
    nameDisplayFormat: 'first_last' | 'last_first'
    dateFormat: 'mdy' | 'dmy' | 'ymd'
    defaultSalaryUnit: string
    analysisContext?: string
    signupAllowedDomains?: string[]
    applicationComplianceEnabled?: boolean
    includeEeo?: boolean
    includeVeteran?: boolean
    includeDisability?: boolean
  } | undefined

  try {
    settings = await db.query.orgSettings.findFirst({
      where: eq(orgSettings.organizationId, orgId),
      columns: {
        nameDisplayFormat: true,
        dateFormat: true,
        defaultSalaryUnit: true,
        analysisContext: true,
        signupAllowedDomains: true,
        applicationComplianceEnabled: true,
        includeEeo: true,
        includeVeteran: true,
        includeDisability: true,
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
    signupAllowedDomains: settings?.signupAllowedDomains ?? [],
    applicationComplianceEnabled: settings?.applicationComplianceEnabled ?? true,
    includeEeo: settings?.includeEeo ?? true,
    includeVeteran: settings?.includeVeteran ?? true,
    includeDisability: settings?.includeDisability ?? true,
  }
})
