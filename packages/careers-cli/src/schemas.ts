import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()
const factoryDivisionSchema = z.enum([
  'factory_capital',
  'factory_services',
  'factory_partners',
  'factory_entertainment',
  'factory_cares',
  'factory_club',
])
const jobDescriptionBlocksSchema = z.array(z.discriminatedUnion('type', [
  z.object({
    type: z.literal('paragraph'),
    heading: z.string().max(200).optional(),
    body: z.string().max(10000),
  }),
  z.object({
    type: z.literal('bullet_list'),
    heading: z.string().max(200),
    items: z.array(z.string().max(500)).max(40),
  }),
])).max(40)
const cliCandidateEmailSchema = z
  .preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email address')
      .max(255)
      .transform((value) => value.toLowerCase()),
  )

export const cliJobCreateSchema = z.object({
  title: z.string().trim().min(1),
  status: optionalText,
  location: optionalText,
  type: optionalText,
  description: optionalText,
  divisions: z.array(factoryDivisionSchema).optional(),
  descriptionBlocks: jobDescriptionBlocksSchema.optional(),
  salaryDisplayOnListing: z.boolean().optional(),
}).passthrough()

export const cliCandidateCreateSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: cliCandidateEmailSchema,
  phone: optionalText,
}).passthrough()

export const cliApplicationCreateSchema = z.object({
  candidateId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  status: optionalText,
}).passthrough()

export const cliInterviewScheduleSchema = z.object({
  applicationId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  scheduledAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().positive().optional(),
}).passthrough()

const cliNotificationCadenceSchema = z.enum(['immediate', 'daily', 'weekly', 'monthly', 'off'])
const cliNotificationPreferenceFields = {
  cadence: cliNotificationCadenceSchema,
  timeZone: z.string().trim().min(1).max(100).refine((timeZone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format()
      return true
    }
    catch {
      return false
    }
  }, 'Invalid timezone'),
  deliveryTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Delivery time must use HH:mm'),
  weeklyDay: z.number().int().min(1).max(7),
  monthlyDay: z.number().int().min(1).max(28),
}

export const cliApplicationNotificationPreferenceSchema = z.object({
  ...cliNotificationPreferenceFields,
})

export const cliHiringInboxNotificationSettingsSchema = z.object({
  ...cliNotificationPreferenceFields,
  recipientEmail: z.email().trim().toLowerCase().nullable(),
})
