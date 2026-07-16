export const AI_USAGE_WINDOW_DAYS = 30

export interface AiUsageDay {
  date: string
  count: number
  promptTokens: number
  completionTokens: number
}

interface BuildAiUsageSeriesOptions {
  endDate?: Date
  endDateKey?: string
  days?: number
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string): Date {
  const year = Number(dateKey.slice(0, 4))
  const month = Number(dateKey.slice(5, 7))
  const day = Number(dateKey.slice(8, 10))
  return new Date(year, month - 1, day, 12)
}

export function buildAiUsageSeries(
  source: AiUsageDay[],
  options: BuildAiUsageSeriesOptions = {},
): AiUsageDay[] {
  const requestedDays = options.days ?? AI_USAGE_WINDOW_DAYS
  const days = Number.isInteger(requestedDays) && requestedDays > 0
    ? requestedDays
    : AI_USAGE_WINDOW_DAYS
  const endDate = options.endDateKey
    ? parseDateKey(options.endDateKey.slice(0, 10))
    : new Date(options.endDate ?? Date.now())
  endDate.setHours(12, 0, 0, 0)

  const valuesByDate = new Map<string, AiUsageDay>()
  for (const row of source) {
    const date = row.date.slice(0, 10)
    const existing = valuesByDate.get(date)
    valuesByDate.set(date, {
      date,
      count: (existing?.count ?? 0) + row.count,
      promptTokens: (existing?.promptTokens ?? 0) + row.promptTokens,
      completionTokens: (existing?.completionTokens ?? 0) + row.completionTokens,
    })
  }

  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - (days - 1))

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    const dateKey = toLocalDateKey(date)
    return valuesByDate.get(dateKey) ?? {
      date: dateKey,
      count: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
  })
}

export function formatUsageDate(dateKey: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(parseDateKey(dateKey))
}

export function getNiceUsageAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  if (value <= 1) return 2

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const niceNormalized = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 5
        ? 5
        : 10

  return niceNormalized * magnitude
}

export function getUsageBarHeight(value: number, axisMax: number): number {
  if (!Number.isFinite(value) || value <= 0 || axisMax <= 0) return 0
  return Math.min(100, Math.max(4, (value / axisMax) * 100))
}
