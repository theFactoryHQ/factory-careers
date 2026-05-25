import { z } from 'zod'
import { SALARY_UNIT_VALUES } from '~~/shared/salary-options'
import {
  normalizeSignupDomain,
  SIGNUP_ALLOWED_DOMAINS_MAX,
  SIGNUP_DOMAIN_PATTERN,
} from '~~/shared/signup-domains'

// ─────────────────────────────────────────────
// Org settings validation schemas
// ─────────────────────────────────────────────

export const signupAllowedDomainsSchema = z.array(
  z.string()
    .trim()
    .toLowerCase()
    .transform(domain => normalizeSignupDomain(domain) ?? '')
    .pipe(
      z.string()
        .max(253)
        .regex(SIGNUP_DOMAIN_PATTERN),
    ),
)
  .max(SIGNUP_ALLOWED_DOMAINS_MAX)
  .transform(domains => Array.from(new Set(domains)).sort((a, b) => a.localeCompare(b)))

export const updateOrgSettingsSchema = z.object({
  nameDisplayFormat: z.enum(['first_last', 'last_first']).optional(),
  dateFormat: z.enum(['mdy', 'dmy', 'ymd']).optional(),
  calendarSyncInterviewers: z.boolean().optional(),
  defaultSalaryUnit: z.enum(SALARY_UNIT_VALUES).optional(),
  analysisContext: z.string().trim().max(4000).optional(),
  signupAllowedDomains: signupAllowedDomainsSchema.optional(),
  applicationComplianceEnabled: z.boolean().optional(),
  includeEeo: z.boolean().optional(),
  includeVeteran: z.boolean().optional(),
  includeDisability: z.boolean().optional(),
})
