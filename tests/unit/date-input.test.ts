import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dateInputToEndOfLocalDay,
  dateInputToStartOfLocalDay,
  toDateInputValue,
} from '../../shared/date-input'

const originalTimezone = process.env.TZ

afterEach(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTimezone
  }
})

describe('date-only job listing boundaries', () => {
  it('keeps a valid-through date open through the end of the selected local day', () => {
    process.env.TZ = 'America/New_York'

    expect(dateInputToEndOfLocalDay('2026-07-16').toISOString())
      .toBe('2026-07-17T03:59:59.999Z')
  })

  it('starts an active-from date at the beginning of the selected local day', () => {
    process.env.TZ = 'America/New_York'

    expect(dateInputToStartOfLocalDay('2026-07-16').toISOString())
      .toBe('2026-07-16T04:00:00.000Z')
  })

  it('rejects malformed date input instead of silently shifting it', () => {
    expect(() => dateInputToEndOfLocalDay('07/16/2026')).toThrow('Invalid date input')
  })

  it('backfills legacy midnight deadlines through the selected calendar day', () => {
    const migration = readFileSync(join(
      process.cwd(),
      'server/database/migrations/0052_job_valid_through_end_of_day.sql',
    ), 'utf8')
    const journal = readFileSync(join(
      process.cwd(),
      'server/database/migrations/meta/_journal.json',
    ), 'utf8')

    expect(migration).toContain("INTERVAL '1 day' - INTERVAL '1 millisecond'")
    expect(migration).toContain("valid_through\"::time = TIME '00:00:00'")
    expect(journal).toContain('"tag": "0052_job_valid_through_end_of_day"')

    process.env.TZ = 'America/New_York'
    expect(toDateInputValue('2026-07-16T23:59:59.999Z')).toBe('2026-07-16')
  })
})
