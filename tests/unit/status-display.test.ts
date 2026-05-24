import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APPLICATION_PIPELINE_STAGES,
  getApplicationStatusBadgeClass,
  getApplicationStatusDotClass,
  getApplicationStatusLabel,
  getApplicationTransitionActionLabel,
  getApplicationTransitionButtonClass,
  getApplicationTransitionDotClass,
  getApplicationTransitionLabel,
  getAnalysisRunStatusBadgeClass,
  getAnalysisRunStatusDotClass,
  getCandidateResponseActionLabel,
  getCandidateResponseButtonClass,
  getCandidateResponseIconClass,
  getCandidateResponseLabel,
  getCandidateResponseSymbol,
  getInterviewStatusBadgeClass,
  getInterviewStatusDotClass,
  getInterviewStatusLabel,
  formatFileSize,
  formatRelativeTime,
  getJobStatusBadgeClass,
  getJobStatusLabel,
  getScoreBadgeClass,
  getScoreBarClass,
  getScoreTextClass,
  getSourceChannelBadgeClass,
  getSourceChannelDotClass,
  getSourceChannelLabel,
} from '../../app/utils/status-display'

describe('status display helpers', () => {
  const stylesheet = readFileSync(join(process.cwd(), 'app/assets/css/main.css'), 'utf8')

  it('returns centralized labels with readable fallbacks', () => {
    expect(getApplicationStatusLabel('screening')).toBe('Screening')
    expect(getApplicationTransitionLabel('new')).toBe('Re-open')
    expect(getApplicationTransitionActionLabel('interview')).toBe('Move to Interview')
    expect(getApplicationTransitionActionLabel('rejected')).toBe('Reject')
    expect(getApplicationStatusLabel('phone_screen')).toBe('Phone Screen')
  })

  it('returns reusable application status classes by variant', () => {
    expect(getApplicationStatusBadgeClass('hired')).toContain('text-green-700')
    expect(getApplicationStatusBadgeClass('hired', 'ring')).toContain('ring-green-200')
    expect(getApplicationStatusBadgeClass('hired', 'subtle-ring')).toContain('ring-green-200/60')
    expect(getApplicationStatusBadgeClass('hired', 'factory')).toContain('text-success-200')
    expect(getApplicationStatusBadgeClass(' SCREENING ', 'ring')).toContain('ring-violet-200')
    expect(getApplicationStatusBadgeClass('new', 'factory')).toContain('blue')
    expect(getApplicationStatusBadgeClass('screening', 'factory')).toContain('violet')
    expect(getApplicationStatusBadgeClass('interview', 'factory')).toContain('amber')
    expect(getApplicationStatusBadgeClass('offer', 'factory')).toContain('teal')
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
    expect(getScoreBadgeClass(75, 'subtle')).toContain('ring-success-200/60')
    expect(getScoreBadgeClass(75, 'soft')).toContain('dark:text-success-400')
    expect(getScoreBadgeClass(75, 'muted')).toContain('dark:bg-success-950/60')
    expect(getScoreTextClass(75)).toContain('text-success')
    expect(getScoreBarClass(40, 80)).toContain('warning')
  })

  it('centralizes AI analysis run status colors', () => {
    expect(getAnalysisRunStatusBadgeClass('completed')).toContain('success')
    expect(getAnalysisRunStatusDotClass('failed')).toContain('danger')
    expect(getAnalysisRunStatusBadgeClass('queued')).toContain('warning')
  })

  it('centralizes source channel display values', () => {
    expect(getSourceChannelLabel('google_jobs')).toBe('Google Jobs')
    expect(getSourceChannelLabel('custom_board')).toBe('custom_board')
    expect(getSourceChannelBadgeClass('linkedin')).toContain('blue')
    expect(getSourceChannelBadgeClass('unknown')).toContain('surface')
    expect(getSourceChannelDotClass('career_site')).toContain('brand')
  })

  it('centralizes job status display values', () => {
    expect(getJobStatusLabel('open')).toBe('Open')
    expect(getJobStatusLabel('pending_review')).toBe('Pending Review')
    expect(getJobStatusBadgeClass('open')).toContain('success')
    expect(getJobStatusBadgeClass('closed', 'ring')).toContain('ring-warning-200')
    expect(getJobStatusBadgeClass('unknown', 'ring')).toContain('ring-surface-200')
  })

  it('centralizes past-due interview display status', () => {
    expect(getInterviewStatusLabel('scheduled_past')).toBe('Past Due')
    expect(getInterviewStatusBadgeClass('scheduled_past')).toContain('warning')
    expect(getInterviewStatusDotClass('scheduled_past')).toContain('warning')
  })

  it('defines every interview status dot class used by filter chips', () => {
    for (const status of ['scheduled', 'scheduled_past', 'completed', 'cancelled', 'no_show']) {
      const dotClass = getInterviewStatusDotClass(status)

      expect(stylesheet, `${dotClass} should be defined`).toContain(`.${dotClass}`)
    }
  })

  it('centralizes candidate interview response display values', () => {
    expect(getCandidateResponseActionLabel('accepted')).toBe('Accept')
    expect(getCandidateResponseActionLabel('tentative')).toBe('Mark as Tentative')
    expect(getCandidateResponseLabel('pending')).toBe('Pending')
    expect(getCandidateResponseLabel('needs_follow_up')).toBe('Needs Follow Up')
    expect(getCandidateResponseButtonClass('accepted')).toContain('success')
    expect(getCandidateResponseButtonClass('declined')).toContain('danger')
    expect(getCandidateResponseButtonClass('tentative')).toContain('warning')
    expect(getCandidateResponseIconClass('declined')).toContain('danger')
    expect(getCandidateResponseSymbol('accepted')).toBe('✓')
  })

  it('centralizes common dashboard formatting helpers', () => {
    const now = new Date('2026-05-23T12:00:00Z').getTime()

    expect(formatRelativeTime('2026-05-23T11:58:00Z', now)).toBe('2m ago')
    expect(formatRelativeTime('2026-05-23T09:00:00Z', now)).toBe('3h ago')
    expect(formatRelativeTime('2026-05-20T12:00:00Z', now)).toBe('3d ago')
    expect(formatFileSize(null)).toBe('—')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})
