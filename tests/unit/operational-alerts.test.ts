import { describe, expect, it } from 'vitest'
import { shouldDispatchCriticalAlert } from '../../server/utils/operationalAlerts'

describe('critical operational alert throttling', () => {
  it('alerts immediately, suppresses repeats, and allows a later incident', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    expect(shouldDispatchCriticalAlert(null, now)).toBe(true)
    expect(shouldDispatchCriticalAlert(new Date('2026-08-14T11:50:01.000Z'), now)).toBe(false)
    expect(shouldDispatchCriticalAlert(new Date('2026-08-14T11:44:59.000Z'), now)).toBe(true)
  })
})
