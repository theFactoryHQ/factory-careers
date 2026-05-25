import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  candidateDateOfBirthSchema,
  candidateEmailSchema,
  candidateGenderValues,
  normalizeEmptyCandidateFormFields,
  personNameSchema,
  publicCandidateEmailSchema,
} from '../../shared/schemas/candidate'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('shared candidate validation schemas', () => {
  it('normalizes candidate email consistently for internal candidate records', () => {
    expect(candidateEmailSchema.parse(' Ada@Example.COM ')).toBe('ada@example.com')
  })

  it('shares core person, phone, gender, and date validation primitives', () => {
    expect(personNameSchema.safeParse('').success).toBe(false)
    expect(personNameSchema.safeParse('A'.repeat(101)).success).toBe(false)
    expect(candidateGenderValues).toEqual(['male', 'female', 'other', 'prefer_not_to_say'])
    expect(candidateDateOfBirthSchema.safeParse('1899-12-31').success).toBe(false)
    expect(candidateDateOfBirthSchema.safeParse('2000-02-29').success).toBe(true)
  })

  it('preserves the public application email length contract while sharing contact validation', () => {
    expect(publicCandidateEmailSchema.parse(' Applicant@Example.COM ')).toBe('applicant@example.com')
    expect(publicCandidateEmailSchema.safeParse(`${'a'.repeat(250)}@x.test`).success).toBe(false)
  })

  it('normalizes empty form strings before parsing optional candidate fields', () => {
    expect(normalizeEmptyCandidateFormFields({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      displayName: '',
      phone: '',
      gender: '',
      dateOfBirth: '',
    })).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      displayName: undefined,
      phone: undefined,
      gender: undefined,
      dateOfBirth: undefined,
    })
  })

  it('keeps candidate create/edit pages and server schemas on shared primitives', () => {
    for (const path of [
      'app/pages/dashboard/candidates/new.vue',
      'app/pages/dashboard/candidates/[id].vue',
      'server/utils/schemas/candidate.ts',
      'server/utils/schemas/publicApplication.ts',
    ]) {
      expect(readProjectFile(path), `${path} should use shared candidate schemas`)
        .toContain('shared/schemas/candidate')
    }

    expect(readProjectFile('app/pages/dashboard/candidates/new.vue')).not.toContain('const formSchema = z.object')
    expect(readProjectFile('app/pages/dashboard/candidates/[id].vue')).not.toContain('const editSchema = z.object')
  })
})
