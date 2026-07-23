import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  clonePremadeCriteria,
  PREMADE_CRITERIA,
  PREMADE_CRITERIA_TEMPLATE_KEYS,
} from '../../shared/scoring-criteria'

const allowedCategories = new Set([
  'technical',
  'experience',
  'soft_skills',
  'education',
  'culture',
  'custom',
])

describe('pre-made scoring criteria templates', () => {
  it('exposes the complete template inventory', () => {
    expect(PREMADE_CRITERIA_TEMPLATE_KEYS).toEqual([
      'standard',
      'technical',
      'non_technical',
    ])
    expect(Object.keys(PREMADE_CRITERIA)).toEqual(PREMADE_CRITERIA_TEMPLATE_KEYS)
    expect(PREMADE_CRITERIA.standard).toHaveLength(3)
    expect(PREMADE_CRITERIA.technical).toHaveLength(5)
    expect(PREMADE_CRITERIA.non_technical).toHaveLength(5)
  })

  it('provides valid criteria with unique keys within each template', () => {
    for (const template of PREMADE_CRITERIA_TEMPLATE_KEYS) {
      const criteria = PREMADE_CRITERIA[template]
      const keys = criteria.map(criterion => criterion.key)

      expect(new Set(keys).size).toBe(keys.length)
      for (const criterion of criteria) {
        expect(criterion.key.trim()).not.toBe('')
        expect(criterion.description).toEqual(expect.any(String))
        expect(criterion.description.trim()).not.toBe('')
        expect(criterion.maxScore).toBe(10)
        expect(allowedCategories.has(criterion.category)).toBe(true)
        expect(criterion.weight).toBeGreaterThanOrEqual(10)
        expect(criterion.weight).toBeLessThanOrEqual(100)
      }
    }
  })

  it('returns a mutable deep clone without exposing the shared singleton', () => {
    const clone = clonePremadeCriteria('technical')

    expect(clone).toEqual(PREMADE_CRITERIA.technical)
    expect(clone).not.toBe(PREMADE_CRITERIA.technical)
    expect(clone[0]).not.toBe(PREMADE_CRITERIA.technical[0])

    clone[0]!.name = 'Changed in the form'

    expect(PREMADE_CRITERIA.technical[0]!.name).toBe('Core Tech Stack Match')
  })
})

describe('pre-made scoring criteria consumers', () => {
  const newJobPage = readFileSync(
    new URL('../../app/pages/dashboard/jobs/new.vue', import.meta.url),
    'utf8',
  )
  const aiAnalysisPage = readFileSync(
    new URL('../../app/pages/dashboard/jobs/[id]/ai-analysis.vue', import.meta.url),
    'utf8',
  )
  const serverScoring = readFileSync(
    new URL('../../server/utils/ai/scoring.ts', import.meta.url),
    'utf8',
  )

  it('imports the browser-safe shared contract in both UI paths and the server', () => {
    expect(newJobPage).toContain("from '~~/shared/scoring-criteria'")
    expect(aiAnalysisPage).toContain("from '~~/shared/scoring-criteria'")
    expect(serverScoring).toContain("from '../../../shared/scoring-criteria'")
  })

  it('does not duplicate the full technical template in any consumer', () => {
    for (const source of [newJobPage, aiAnalysisPage, serverScoring]) {
      expect(source).not.toContain("key: 'core_tech_stack'")
    }
  })
})
