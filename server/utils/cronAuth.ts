import { timingSafeStringEqual } from './secureCompare'

export function requireCronSecret(
  providedSecret: string | undefined,
  expectedSecret: string | undefined,
): void {
  if (
    !providedSecret
    || !expectedSecret
    || !timingSafeStringEqual(providedSecret, expectedSecret)
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid cron secret' })
  }
}
