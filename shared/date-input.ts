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
