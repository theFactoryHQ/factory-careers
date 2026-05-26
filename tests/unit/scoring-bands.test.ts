import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCORING_BANDS,
  findScoringBand,
  normalizeScoringBands,
  resolveScoringBands,
} from '../../shared/scoring-bands'

describe('scoring bands', () => {
  it('uses informational defaults with Unlikely Fit as the first band', () => {
    expect(DEFAULT_SCORING_BANDS).toEqual([
      { label: 'Unlikely Fit', minScore: 0, maxScore: 39, color: 'danger' },
      { label: 'Potential Fit', minScore: 40, maxScore: 69, color: 'warning' },
      { label: 'Strong Fit', minScore: 70, maxScore: 100, color: 'success' },
    ])
  })

  it('finds the band for a composite score inclusively', () => {
    expect(findScoringBand(0, DEFAULT_SCORING_BANDS)?.label).toBe('Unlikely Fit')
    expect(findScoringBand(39, DEFAULT_SCORING_BANDS)?.label).toBe('Unlikely Fit')
    expect(findScoringBand(40, DEFAULT_SCORING_BANDS)?.label).toBe('Potential Fit')
    expect(findScoringBand(70, DEFAULT_SCORING_BANDS)?.label).toBe('Strong Fit')
    expect(findScoringBand(100, DEFAULT_SCORING_BANDS)?.label).toBe('Strong Fit')
  })

  it('normalizes incomplete or invalid band config back to defaults', () => {
    expect(normalizeScoringBands(null)).toEqual(DEFAULT_SCORING_BANDS)
    expect(normalizeScoringBands([{ label: '', minScore: 25, maxScore: 10 }])).toEqual(DEFAULT_SCORING_BANDS)
  })

  it('resolves job-specific bands ahead of global defaults', () => {
    const globalBands = [
      { label: 'Global Low', minScore: 0, maxScore: 49, color: 'danger' },
      { label: 'Global High', minScore: 50, maxScore: 100, color: 'success' },
    ]
    const jobBands = [
      { label: 'Job Low', minScore: 0, maxScore: 24, color: 'danger' },
      { label: 'Job High', minScore: 25, maxScore: 100, color: 'success' },
    ]

    expect(resolveScoringBands({ globalBands, jobBands })).toEqual(jobBands)
    expect(resolveScoringBands({ globalBands, jobBands: null })).toEqual(globalBands)
  })
})
