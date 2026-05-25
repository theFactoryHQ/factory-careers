import { z } from 'zod'

export const candidateGenderValues = ['male', 'female', 'other', 'prefer_not_to_say'] as const

export type CandidateGender = typeof candidateGenderValues[number]

export const personNameSchema = z.string().min(1, 'First name is required').max(100)
export const candidateLastNameSchema = z.string().min(1, 'Last name is required').max(100)
export const candidateDisplayNameSchema = z.string().max(200)
export const candidatePhoneSchema = z.string().max(50)
export const candidateGenderSchema = z.enum(candidateGenderValues)

export const candidateEmailSchema = z
  .preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email address')
      .max(255)
      .transform((value) => value.toLowerCase()),
  )

export const publicCandidateEmailSchema = z
  .preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z
      .string()
      .email('Invalid email address')
      .max(254)
      .transform((value) => value.toLowerCase()),
  )

export const candidateDateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    const year = date.getFullYear()
    return year >= 1900 && date <= new Date()
  }, 'Date of birth must be a valid past date')

export const candidateCreateFieldsSchema = z.object({
  firstName: personNameSchema,
  lastName: candidateLastNameSchema,
  displayName: candidateDisplayNameSchema.optional(),
  email: candidateEmailSchema,
  phone: candidatePhoneSchema.optional(),
  gender: candidateGenderSchema.optional(),
  dateOfBirth: candidateDateOfBirthSchema.optional(),
})

export const candidateUpdateFieldsSchema = z.object({
  firstName: personNameSchema.optional(),
  lastName: candidateLastNameSchema.optional(),
  displayName: candidateDisplayNameSchema.nullish(),
  email: candidateEmailSchema.optional(),
  phone: candidatePhoneSchema.nullish(),
  gender: candidateGenderSchema.nullish(),
  dateOfBirth: candidateDateOfBirthSchema.nullish(),
})

export const candidateFormSchema = candidateCreateFieldsSchema
export const candidateEditFormSchema = candidateCreateFieldsSchema

export function emptyStringToUndefined<T>(value: T): T | undefined {
  return value === '' ? undefined : value
}

export function normalizeEmptyCandidateFormFields<T extends {
  displayName?: string
  phone?: string
  gender?: string
  dateOfBirth?: string
}>(fields: T): Omit<T, 'displayName' | 'phone' | 'gender' | 'dateOfBirth'> & {
  displayName?: string
  phone?: string
  gender?: string
  dateOfBirth?: string
} {
  return {
    ...fields,
    displayName: emptyStringToUndefined(fields.displayName),
    phone: emptyStringToUndefined(fields.phone),
    gender: emptyStringToUndefined(fields.gender),
    dateOfBirth: emptyStringToUndefined(fields.dateOfBirth),
  }
}
