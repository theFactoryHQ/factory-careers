export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return ''

  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

export function todayDateInputValue(): string {
  return toDateInputValue(new Date())
}

function parseDateInputParts(value: string): [year: number, monthIndex: number, day: number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid date input: ${value}`)

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const verification = new Date(year, monthIndex, day)
  if (
    verification.getFullYear() !== year
    || verification.getMonth() !== monthIndex
    || verification.getDate() !== day
  ) {
    throw new Error(`Invalid date input: ${value}`)
  }

  return [year, monthIndex, day]
}

/** Convert a date-only control value to the beginning of that day in the operator's timezone. */
export function dateInputToStartOfLocalDay(value: string): Date {
  const [year, monthIndex, day] = parseDateInputParts(value)
  return new Date(year, monthIndex, day, 0, 0, 0, 0)
}

/** Convert a date-only control value to the inclusive end of that day in the operator's timezone. */
export function dateInputToEndOfLocalDay(value: string): Date {
  const [year, monthIndex, day] = parseDateInputParts(value)
  return new Date(year, monthIndex, day, 23, 59, 59, 999)
}
