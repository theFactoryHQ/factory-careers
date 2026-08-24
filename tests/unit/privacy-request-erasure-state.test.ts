import { describe, expect, it } from 'vitest'
import {
  buildPrivacyRequestErasureSummary,
  getPrivacyRequestErasureNotice,
} from '../../shared/privacyRequestErasure'
import {
  assertPrivacyRequestFulfillableStatus,
  assertPrivacyRequestStatusTransition,
} from '../../server/utils/privacyRequests'

describe('privacy request erasure state', () => {
  it('derives no erasure work for an ordinary in-review request with zero tombstones', () => {
    const erasure = buildPrivacyRequestErasureSummary([])

    expect(erasure).toEqual({ state: 'none', totalCount: 0, outstandingCount: 0 })
    expect(getPrivacyRequestErasureNotice(erasure)).toBeNull()
  })

  it('reports active and failed tombstones without relying on request status', () => {
    const pending = buildPrivacyRequestErasureSummary([
      { status: 'pending', count: 1 },
      { status: 'processing', count: 2 },
      { status: 'completed', count: 4 },
    ])
    const failed = buildPrivacyRequestErasureSummary([
      { status: 'completed', count: 2 },
      { status: 'failed', count: 1 },
    ])

    expect(pending).toEqual({ state: 'pending', totalCount: 7, outstandingCount: 3 })
    expect(getPrivacyRequestErasureNotice(pending)).toBe('Private document erasure is still pending for 3 objects.')
    expect(failed).toEqual({ state: 'failed', totalCount: 3, outstandingCount: 1 })
    expect(getPrivacyRequestErasureNotice(failed)).toBe('Private document erasure requires attention for 1 object.')
  })

  it('reports completed only when tombstones exist and all are complete', () => {
    expect(buildPrivacyRequestErasureSummary([{ status: 'completed', count: 2 }]))
      .toEqual({ state: 'completed', totalCount: 2, outstandingCount: 0 })
  })
})

describe('privacy request terminal transition guards', () => {
  it.each(['denied', 'cancelled'] as const)('rejects fulfillment of a %s request', (status) => {
    expect(() => assertPrivacyRequestFulfillableStatus(status)).toThrow(/terminal disposition/i)
  })

  it.each(['denied', 'cancelled'] as const)('preserves a %s request against reopening', (status) => {
    expect(() => assertPrivacyRequestStatusTransition(status, 'in_review')).toThrow(/terminal disposition/i)
    expect(() => assertPrivacyRequestStatusTransition(status, status)).not.toThrow()
  })

  it('rejects a late denial after worker completion wins the race', () => {
    expect(() => assertPrivacyRequestStatusTransition('completed', 'denied')).toThrow(/terminal disposition/i)
  })
})
