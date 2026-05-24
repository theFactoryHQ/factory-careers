import { z } from 'zod'
import { SALARY_UNIT_VALUES } from '~~/shared/salary-options'

// ─────────────────────────────────────────────
// Org settings validation schemas
// ─────────────────────────────────────────────

export const updateOrgSettingsSchema = z.object({
  nameDisplayFormat: z.enum(['first_last', 'last_first']).optional(),
  dateFormat: z.enum(['mdy', 'dmy', 'ymd']).optional(),
  calendarSyncInterviewers: z.boolean().optional(),
  defaultSalaryUnit: z.enum(SALARY_UNIT_VALUES).optional(),
})
