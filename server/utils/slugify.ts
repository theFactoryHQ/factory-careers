// ─────────────────────────────────────────────
// URL slug generation for public-facing job pages
// ─────────────────────────────────────────────

import { and, eq, ne } from 'drizzle-orm'
import { job } from '../database/schema'

const MAX_SLUG_LENGTH = 80
const MAX_SLUG_COLLISION_ATTEMPTS = 100

/**
 * Generates a URL-safe slug from a job title or custom slug.
 * If a custom slug is provided, it is sanitised and used instead of the title.
 */
export function generateJobSlug(title: string, _id: string, customSlug?: string): string {
  const raw = customSlug?.trim() || title
  const base = raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // strip non-word chars (except spaces/hyphens)
    .replace(/[\s_]+/g, '-')     // spaces / underscores → hyphens
    .replace(/-+/g, '-')         // collapse multiple hyphens
    .replace(/^-|-$/g, '')       // trim leading/trailing hyphens
    .slice(0, MAX_SLUG_LENGTH)   // cap slug length

  return base || 'job'
}

export function appendJobSlugSuffix(baseSlug: string, suffix: number): string {
  const numericSuffix = Number.isFinite(suffix) ? Math.max(2, Math.trunc(suffix)) : 2
  const suffixText = `-${numericSuffix}`
  const normalizedBase = baseSlug.replace(/-+$/g, '') || 'job'
  const maxBaseLength = MAX_SLUG_LENGTH - suffixText.length
  const truncatedBase = normalizedBase
    .slice(0, maxBaseLength)
    .replace(/-+$/g, '') || 'job'

  return `${truncatedBase}${suffixText}`
}

export async function generateUniqueJobSlug(params: {
  title: string
  id: string
  customSlug?: string
  currentJobId?: string
}): Promise<string> {
  const baseSlug = generateJobSlug(params.title, params.id, params.customSlug)

  for (let attempt = 0; attempt < MAX_SLUG_COLLISION_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? baseSlug : appendJobSlugSuffix(baseSlug, attempt + 1)
    const existing = await db.query.job.findFirst({
      where: params.currentJobId
        ? and(eq(job.slug, candidate), ne(job.id, params.currentJobId))
        : eq(job.slug, candidate),
      columns: { id: true },
    })

    if (!existing) return candidate
  }

  throw createError({
    statusCode: 409,
    statusMessage: 'Could not generate a unique job URL slug. Enter a custom slug and try again.',
  })
}
