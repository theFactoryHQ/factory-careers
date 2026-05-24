import { z } from 'zod'
import { SALARY_UNIT_VALUES } from '~~/shared/salary-options'

// ─────────────────────────────────────────────
// Org settings validation schemas
// ─────────────────────────────────────────────

export const signupAllowedDomainsSchema = z.array(
  z.string()
    .trim()
    .toLowerCase()
    .transform(domain => domain.replace(/^@+/, '').replace(/\.$/, ''))
    .pipe(
      z.string()
        .max(253)
        .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
    ),
)
  .max(50)
  .transform(domains => Array.from(new Set(domains)).sort((a, b) => a.localeCompare(b)))

export const updateOrgSettingsSchema = z.object({
  nameDisplayFormat: z.enum(['first_last', 'last_first']).optional(),
  dateFormat: z.enum(['mdy', 'dmy', 'ymd']).optional(),
  calendarSyncInterviewers: z.boolean().optional(),
  defaultSalaryUnit: z.enum(SALARY_UNIT_VALUES).optional(),
  signupAllowedDomains: signupAllowedDomainsSchema.optional(),
})
