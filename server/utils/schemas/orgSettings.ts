import { z } from 'zod'
import { SALARY_UNIT_VALUES } from '~~/shared/salary-options'
import {
  normalizeSignupDomain,
  SIGNUP_ALLOWED_DOMAINS_MAX,
  SIGNUP_DOMAIN_PATTERN,
} from '~~/shared/signup-domains'
import { scoringBandsSchema } from './scoringBands'

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
  scoringBands: scoringBandsSchema.optional(),
  signupAllowedDomains: signupAllowedDomainsSchema.optional(),
  applicationComplianceEnabled: z.boolean().optional(),
  includeEeo: z.boolean().optional(),
  includeVeteran: z.boolean().optional(),
  includeDisability: z.boolean().optional(),
  sendApplicationAcknowledgement: z.boolean().optional(),
  applicationAcknowledgementTemplateId: z.string().min(1).nullable().optional(),
  applicationAcknowledgementDelayMinutes: z.number().int().min(0).max(10080).optional(),
  applicationAcknowledgementBusinessHoursOnly: z.boolean().optional(),
  sendApplicationRejection: z.boolean().optional(),
  applicationRejectionTemplateId: z.string().min(1).nullable().optional(),
  applicationRejectionDelayMinutes: z.number().int().min(0).max(10080).optional(),
  applicationRejectionBusinessHoursOnly: z.boolean().optional(),
  interviewInvitationTemplateId: z.string().min(1).nullable().optional(),
  emailBusinessHoursTimezone: z.string()
    .trim()
    .min(1)
    .max(100)
    .refine((timeZone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone })
        return true
      }
      catch {
        return false
      }
    }, 'Invalid timezone')
    .optional(),
  emailBusinessHoursStartHour: z.number().int().min(0).max(23).optional(),
  emailBusinessHoursEndHour: z.number().int().min(1).max(24).optional(),
}).refine((settings) => {
  if (settings.emailBusinessHoursStartHour === undefined || settings.emailBusinessHoursEndHour === undefined) {
    return true
  }
  return settings.emailBusinessHoursEndHour > settings.emailBusinessHoursStartHour
}, {
  message: 'Business hours end must be after start',
  path: ['emailBusinessHoursEndHour'],
})
