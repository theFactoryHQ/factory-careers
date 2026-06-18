import { describe, expect, it } from 'vitest'
import { appendJobSlugSuffix, generateJobSlug } from '../../server/utils/slugify'

describe('job slug generation', () => {
  const jobId = '650cd088-5034-465b-8e8c-9ebd6aa3139a'

  it('auto-generates title-only slugs without id suffixes', () => {
    expect(generateJobSlug('Director, Impact & Community', jobId)).toBe('director-impact-community')
  })

  it('sanitizes custom slugs without appending ids', () => {
    expect(generateJobSlug('Director, Impact & Community', jobId, '  FACTORY Cares / Club!!  ')).toBe('factory-cares-club')
  })

  it('falls back to a stable slug when the source has no slug characters', () => {
    expect(generateJobSlug('&&&', jobId)).toBe('job')
  })

  it('adds readable numeric suffixes only for real collisions', () => {
    expect(appendJobSlugSuffix('director-impact-community', 2)).toBe('director-impact-community-2')
    expect(appendJobSlugSuffix('a'.repeat(80), 12)).toHaveLength(80)
    expect(appendJobSlugSuffix('---', 2)).toBe('job-2')
  })
})
