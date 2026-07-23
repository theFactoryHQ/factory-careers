import { describe, expect, it, vi } from 'vitest'

vi.mock('../../server/utils/db', () => ({ db: {} }))
vi.mock('../../server/utils/baseUrl', () => ({
  resolveFactoryCareersBaseUrl: () => 'http://localhost:3000',
}))
vi.mock('../../server/utils/email', () => ({
  sendApplicationNotificationEmail: vi.fn(),
}))
vi.mock('../../server/utils/env', () => ({
  env: { FACTORY_ORG_NAME: 'Factory' },
}))

import {
  emitApplicationNotificationFailureTelemetry,
  type ApplicationNotificationQueueLogger,
} from '../../server/utils/applicationNotificationQueue'

function fakeLogger(): ApplicationNotificationQueueLogger & {
  logError: ReturnType<typeof vi.fn>
  logWarn: ReturnType<typeof vi.fn>
} {
  return {
    logError: vi.fn(),
    logWarn: vi.fn(),
  }
}

describe('application notification failure telemetry', () => {
  it.each([
    {
      transition: {
        organizationId: 'org-safe',
        queueKind: 'event' as const,
        recordId: 'event-safe',
        attemptCount: 1,
        maxAttempts: 5,
        resultCode: 'fanout_timeout',
        retryable: true,
      },
      eventName: 'application_notification.event_retry_scheduled',
      severity: 'warn' as const,
      attributes: {
        org_id: 'org-safe',
        queue_kind: 'event',
        record_id: 'event-safe',
        attempt_count: 1,
        max_attempts: 5,
        result_code: 'fanout_timeout',
        retryable: true,
      },
    },
    {
      transition: {
        organizationId: 'org-safe',
        queueKind: 'event' as const,
        recordId: 'event-safe',
        attemptCount: 5,
        maxAttempts: 5,
        resultCode: 'fanout_failed',
        retryable: false,
      },
      eventName: 'application_notification.event_failed',
      severity: 'error' as const,
      attributes: {
        org_id: 'org-safe',
        queue_kind: 'event',
        record_id: 'event-safe',
        attempt_count: 5,
        max_attempts: 5,
        result_code: 'fanout_failed',
        retryable: false,
      },
    },
    {
      transition: {
        organizationId: 'org-safe',
        queueKind: 'message' as const,
        recordId: 'message-safe',
        attemptCount: 2,
        maxAttempts: 5,
        resultCode: 'provider_timeout',
        retryable: true,
        cadence: 'daily',
        recipientKind: 'member' as const,
      },
      eventName: 'application_notification.message_retry_scheduled',
      severity: 'warn' as const,
      attributes: {
        org_id: 'org-safe',
        queue_kind: 'message',
        record_id: 'message-safe',
        attempt_count: 2,
        max_attempts: 5,
        result_code: 'provider_timeout',
        retryable: true,
        cadence: 'daily',
        recipient_kind: 'member',
      },
    },
    {
      transition: {
        organizationId: 'org-safe',
        queueKind: 'message' as const,
        recordId: 'message-safe',
        attemptCount: 5,
        maxAttempts: 5,
        resultCode: 'provider_failed',
        retryable: false,
        cadence: 'immediate',
        recipientKind: 'hiring_inbox' as const,
      },
      eventName: 'application_notification.message_failed',
      severity: 'error' as const,
      attributes: {
        org_id: 'org-safe',
        queue_kind: 'message',
        record_id: 'message-safe',
        attempt_count: 5,
        max_attempts: 5,
        result_code: 'provider_failed',
        retryable: false,
        cadence: 'immediate',
        recipient_kind: 'hiring_inbox',
      },
    },
  ])('emits one $severity event for $eventName', ({
    attributes,
    eventName,
    severity,
    transition,
  }) => {
    const logger = fakeLogger()

    emitApplicationNotificationFailureTelemetry(transition, logger)

    expect(logger.logWarn).toHaveBeenCalledTimes(severity === 'warn' ? 1 : 0)
    expect(logger.logError).toHaveBeenCalledTimes(severity === 'error' ? 1 : 0)
    const method = severity === 'warn' ? logger.logWarn : logger.logError
    expect(method).toHaveBeenCalledWith(eventName, attributes)
  })

  it.each([
    {
      queueKind: 'event' as const,
      recordId: 'expired-event',
    },
    {
      queueKind: 'message' as const,
      recordId: 'expired-message',
      cadence: 'weekly',
      recipientKind: 'hiring_inbox' as const,
    },
  ])('reports an exhausted $queueKind lease as a terminal error', transition => {
    const logger = fakeLogger()

    emitApplicationNotificationFailureTelemetry({
      organizationId: 'org-safe',
      attemptCount: 5,
      maxAttempts: 5,
      resultCode: 'lease_expired',
      retryable: false,
      ...transition,
    }, logger)

    expect(logger.logWarn).not.toHaveBeenCalled()
    expect(logger.logError).toHaveBeenCalledTimes(1)
    expect(logger.logError.mock.calls[0]?.[0]).toBe(
      `application_notification.${transition.queueKind}_failed`,
    )
    expect(logger.logError.mock.calls[0]?.[1]).toMatchObject({
      result_code: 'lease_expired',
      retryable: false,
    })
  })

  it('emits nothing when a fenced transition owns no row', () => {
    const logger = fakeLogger()

    emitApplicationNotificationFailureTelemetry(null, logger)

    expect(logger.logWarn).not.toHaveBeenCalled()
    expect(logger.logError).not.toHaveBeenCalled()
  })

  it('constructs attributes from a strict safe allowlist', () => {
    const logger = fakeLogger()
    const transition = {
      organizationId: 'org-safe',
      queueKind: 'message' as const,
      recordId: 'message-safe',
      attemptCount: 1,
      maxAttempts: 5,
      resultCode: 'Resend 503 for private@example.com',
      retryable: true,
      cadence: 'daily',
      recipientKind: 'member' as const,
      recipientEmail: 'private@example.com',
      candidateName: 'Private Candidate',
      applicationId: 'private-application',
      rawError: 'provider payload with token=secret',
    }

    emitApplicationNotificationFailureTelemetry(transition, logger)

    expect(logger.logWarn).toHaveBeenCalledWith(
      'application_notification.message_retry_scheduled',
      {
        org_id: 'org-safe',
        queue_kind: 'message',
        record_id: 'message-safe',
        attempt_count: 1,
        max_attempts: 5,
        result_code: 'notification_delivery_failed',
        retryable: true,
        cadence: 'daily',
        recipient_kind: 'member',
      },
    )
    const serialized = JSON.stringify(logger.logWarn.mock.calls)
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('Private Candidate')
    expect(serialized).not.toContain('private-application')
    expect(serialized).not.toContain('provider payload')
    expect(serialized).not.toContain('secret')
  })
})
