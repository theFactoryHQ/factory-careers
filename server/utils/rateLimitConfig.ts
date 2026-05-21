/**
 * Reads an optional positive-integer environment override for a rate-limit
 * setting. Invalid values fall back to the production-safe default and emit a
 * warning so misconfiguration does not fail silently.
 */
export function readPositiveIntegerEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return defaultValue

  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    console.warn(
      `[rateLimit] Ignoring invalid ${name}=${JSON.stringify(raw)}; expected a positive integer.`,
    )
    return defaultValue
  }

  return parsed
}
