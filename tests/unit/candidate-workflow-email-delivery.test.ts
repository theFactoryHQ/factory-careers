import { describe, expect, it } from 'vitest'
import {
  calculateCandidateWorkflowAvailableAt,
  getCandidateWorkflowEmailDedupeKey,
  getCandidateWorkflowEmailFailureOutcome,
} from '../../shared/candidate-workflow-email'

describe('candidate workflow email delivery', () => {
  const now = new Date('2026-07-24T20:00:00.000Z')

  it('calculates delays from an injected clock and advances after-hours sends to Monday', () => {
    expect(calculateCandidateWorkflowAvailableAt({
      delayMinutes: 5,
      businessHoursOnly: false,
    }, now).toISOString()).toBe('2026-07-24T20:05:00.000Z')

    expect(calculateCandidateWorkflowAvailableAt({
      delayMinutes: 120,
      businessHoursOnly: true,
      businessHoursTimezone: 'America/New_York',
      businessHoursStartHour: 9,
      businessHoursEndHour: 17,
    }, now).toISOString()).toBe('2026-07-27T13:00:00.000Z')
  })

  it('uses stable acknowledgement and transition-specific rejection keys', () => {
    expect(getCandidateWorkflowEmailDedupeKey({
      applicationId: 'application-1',
      purpose: 'application_acknowledgement',
      transitionAt: now,
    })).toBe('candidate-workflow-email:application_acknowledgement:application-1')

    expect(getCandidateWorkflowEmailDedupeKey({
      applicationId: 'application-1',
      purpose: 'application_rejection',
      transitionAt: now,
    })).toBe('candidate-workflow-email:application_rejection:application-1:2026-07-24T20:00:00.000Z')
  })

  it('backs off bounded retries and emits only sanitized result codes', () => {
    expect(getCandidateWorkflowEmailFailureOutcome({
      attemptCount: 1,
      maxAttempts: 5,
      now,
      failureCode: 'ProviderTimeoutError',
    })).toEqual({
      status: 'pending',
      resultCode: 'provider_timeout_error',
      availableAt: new Date('2026-07-24T20:00:30.000Z'),
      completedAt: null,
    })

    expect(getCandidateWorkflowEmailFailureOutcome({
      attemptCount: 5,
      maxAttempts: 5,
      now,
      failureCode: 'Provider rejected raw content',
    })).toEqual({
      status: 'failed',
      resultCode: 'provider_rejected_raw_content',
      availableAt: now,
      completedAt: now,
    })
  })
})
