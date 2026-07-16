import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AI_USAGE_WINDOW_DAYS,
  buildAiUsageSeries,
  formatUsageDate,
  getNiceUsageAxisMax,
  getUsageBarHeight,
} from '../../app/utils/ai-usage-chart'

describe('AI usage chart defaults', () => {
  it('builds a rolling 30-day series and fills quiet days with zero values', () => {
    const source = [
      { date: '2026-06-16', count: 9, promptTokens: 900, completionTokens: 90 },
      { date: '2026-07-14', count: 1, promptTokens: 120, completionTokens: 30 },
      { date: '2026-07-16', count: 3, promptTokens: 450, completionTokens: 100 },
    ]

    const series = buildAiUsageSeries(source, {
      endDate: new Date(2026, 6, 16, 12),
    })

    expect(AI_USAGE_WINDOW_DAYS).toBe(30)
    expect(series).toHaveLength(30)
    expect(series[0]).toEqual({
      date: '2026-06-17',
      count: 0,
      promptTokens: 0,
      completionTokens: 0,
    })
    expect(series.at(-1)?.date).toBe('2026-07-16')
    expect(series.find(day => day.date === '2026-07-14')).toMatchObject({
      count: 1,
      promptTokens: 120,
      completionTokens: 30,
    })
    expect(series.find(day => day.date === '2026-07-15')).toMatchObject({
      count: 0,
      promptTokens: 0,
      completionTokens: 0,
    })
    expect(series.some(day => day.date === '2026-06-16')).toBe(false)
    expect(source).toHaveLength(3)
  })

  it('formats date-only values without shifting them across time zones', () => {
    expect(formatUsageDate('2026-07-01', 'en-US')).toBe('Jul 1')
  })

  it('keeps an API-provided window end stable across server and browser time zones', () => {
    const previousTimeZone = process.env.TZ

    try {
      process.env.TZ = 'UTC'
      const serverSeries = buildAiUsageSeries([], { endDateKey: '2031-01-02' })

      process.env.TZ = 'America/New_York'
      const browserSeries = buildAiUsageSeries([], { endDateKey: '2031-01-02' })

      expect(serverSeries).toEqual(browserSeries)
      expect(serverSeries.at(-1)?.date).toBe('2031-01-02')
    }
    finally {
      if (previousTimeZone === undefined) {
        delete process.env.TZ
      }
      else {
        process.env.TZ = previousTimeZone
      }
    }
  })

  it('uses readable axis ceilings and keeps zero-value bars at zero height', () => {
    expect(getNiceUsageAxisMax(0)).toBe(1)
    expect(getNiceUsageAxisMax(1)).toBe(2)
    expect(getNiceUsageAxisMax(3)).toBe(5)
    expect(getNiceUsageAxisMax(1260)).toBe(2000)

    expect(getUsageBarHeight(0, 5)).toBe(0)
    expect(getUsageBarHeight(-1, 5)).toBe(0)
    expect(getUsageBarHeight(0.01, 5)).toBe(4)
    expect(getUsageBarHeight(2.5, 5)).toBe(50)
    expect(getUsageBarHeight(9, 5)).toBe(100)
  })

  it('renders the normalized series instead of stretching sparse API rows', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/pages/dashboard/ai-analysis.vue'),
      'utf8',
    )

    expect(page).toContain('buildAiUsageSeries')
    expect(page).toContain('usageDays')
    expect(page).toContain('stats.value?.usagePeriod.endDate')
    expect(page).not.toContain('const usageWindowEnd = new Date()')
    expect(page).toContain('const { locale } = useI18n()')
    expect(page).toContain('return formatUsageDate(dateKey, locale.value)')
    expect(page).not.toContain('v-for="day in dailyRuns"')
  })

  it('describes every scoring status included in daily run counts', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/pages/dashboard/ai-analysis.vue'),
      'utf8',
    )

    expect(page).toContain('Completed, failed, and partial scoring runs')
    expect(page).not.toContain('Completed and failed scoring runs')
  })
})
