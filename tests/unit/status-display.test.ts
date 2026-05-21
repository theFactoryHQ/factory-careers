import { describe, expect, it } from 'vitest'
import {
  APPLICATION_PIPELINE_STAGES,
  getApplicationStatusBadgeClass,
  getApplicationStatusDotClass,
  getApplicationStatusLabel,
  getApplicationTransitionButtonClass,
  getApplicationTransitionDotClass,
  getApplicationTransitionLabel,
  getScoreBadgeClass,
} from '../../app/utils/status-display'

describe('status display helpers', () => {
  it('returns centralized labels with readable fallbacks', () => {
    expect(getApplicationStatusLabel('screening')).toBe('Screening')
    expect(getApplicationTransitionLabel('new')).toBe('Re-open')
    expect(getApplicationStatusLabel('phone_screen')).toBe('Phone Screen')
  })

  it('returns reusable application status classes by variant', () => {
    expect(getApplicationStatusBadgeClass('hired')).toContain('text-green-700')
    expect(getApplicationStatusBadgeClass('hired', 'ring')).toContain('ring-green-200')
    expect(getApplicationStatusBadgeClass('hired', 'factory')).toContain('text-success-200')
    expect(getApplicationStatusBadgeClass('unknown', 'factory')).toContain('text-white/58')
  })

  it('returns centralized transition and pipeline colors', () => {
    expect(getApplicationTransitionButtonClass('rejected')).toContain('danger')
    expect(getApplicationTransitionButtonClass('screening', 'subtle')).toContain('violet')
    expect(getApplicationTransitionDotClass('offer')).toContain('teal')
    expect(getApplicationStatusDotClass('interview')).toContain('amber')
    expect(APPLICATION_PIPELINE_STAGES.map((stage) => stage.key)).toEqual([
      'new',
      'screening',
      'interview',
      'offer',
      'hired',
    ])
    expect(APPLICATION_PIPELINE_STAGES.find((stage) => stage.key === 'screening')?.barClass).toContain('violet')
  })

  it('uses shared score thresholds', () => {
    expect(getScoreBadgeClass(75)).toContain('success')
    expect(getScoreBadgeClass(40)).toContain('warning')
    expect(getScoreBadgeClass(39)).toContain('danger')
    expect(getScoreBadgeClass(null)).toContain('surface')
  })
})
