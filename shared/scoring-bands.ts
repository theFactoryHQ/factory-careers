export type ScoringBandColor = 'danger' | 'warning' | 'success' | 'neutral'

export interface ScoringBand {
  label: string
  minScore: number
  maxScore: number
  color: ScoringBandColor
  description?: string
}

export const DEFAULT_SCORING_BANDS: ScoringBand[] = [
  { label: 'Unlikely Fit', minScore: 0, maxScore: 39, color: 'danger' },
  { label: 'Potential Fit', minScore: 40, maxScore: 69, color: 'warning' },
  { label: 'Strong Fit', minScore: 70, maxScore: 100, color: 'success' },
]

function isScoringBand(value: unknown): value is ScoringBand {
  if (!value || typeof value !== 'object') return false
  const band = value as Partial<ScoringBand>

  return typeof band.label === 'string'
    && band.label.trim().length > 0
    && typeof band.minScore === 'number'
    && typeof band.maxScore === 'number'
    && Number.isInteger(band.minScore)
    && Number.isInteger(band.maxScore)
    && band.minScore >= 0
    && band.maxScore <= 100
    && band.minScore <= band.maxScore
    && ['danger', 'warning', 'success', 'neutral'].includes(String(band.color))
}

export function normalizeScoringBands(value: unknown): ScoringBand[] {
  if (!Array.isArray(value)) return [...DEFAULT_SCORING_BANDS]

  const bands = value
    .filter(isScoringBand)
    .map((band) => ({
      label: band.label.trim(),
      minScore: band.minScore,
      maxScore: band.maxScore,
      color: band.color,
      ...(band.description?.trim() ? { description: band.description.trim() } : {}),
    }))
    .sort((a, b) => a.minScore - b.minScore)

  return bands.length > 0 ? bands : [...DEFAULT_SCORING_BANDS]
}

export function resolveScoringBands(options: {
  globalBands: unknown
  jobBands?: unknown
}): ScoringBand[] {
  if (Array.isArray(options.jobBands) && options.jobBands.length > 0) {
    return normalizeScoringBands(options.jobBands)
  }

  return normalizeScoringBands(options.globalBands)
}

export function findScoringBand(score: number | null | undefined, bands: unknown): ScoringBand | null {
  if (score == null || !Number.isFinite(score)) return null

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
  return normalizeScoringBands(bands).find((band) =>
    normalizedScore >= band.minScore && normalizedScore <= band.maxScore
  ) ?? null
}
