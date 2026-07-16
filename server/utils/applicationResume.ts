import { and, desc, eq, isNull } from 'drizzle-orm'
import { document } from '../database/schema'
import { db } from './db'

const RESUME_ORDER = ['createdAtDesc', 'idDesc'] as const

export type ApplicationResumeDocument = {
  id: string
  parsedContent: unknown
}

export type ApplicationResumeQuery = {
  organizationId: string
  applicationId: string | null
  candidateId: string
  orderBy: typeof RESUME_ORDER
}

export type ApplicationResumeQueryAdapter = {
  findResume(query: ApplicationResumeQuery): Promise<ApplicationResumeDocument | null>
}

const drizzleResumeQueryAdapter: ApplicationResumeQueryAdapter = {
  async findResume(query) {
    const [resume] = await db.select({
      id: document.id,
      parsedContent: document.parsedContent,
    })
      .from(document)
      .where(and(
        eq(document.organizationId, query.organizationId),
        eq(document.candidateId, query.candidateId),
        eq(document.type, 'resume'),
        query.applicationId === null
          ? isNull(document.applicationId)
          : eq(document.applicationId, query.applicationId),
      ))
      .orderBy(desc(document.createdAt), desc(document.id))
      .limit(1)

    return resume ?? null
  },
}

/**
 * Load the resume submitted for an application. Records created before document
 * association was introduced are considered only when the application has no
 * associated resume; a present but unparsed associated resume must not be
 * silently replaced by a different document.
 */
export async function loadApplicationResume(
  organizationId: string,
  applicationId: string,
  candidateId: string,
  adapter: ApplicationResumeQueryAdapter = drizzleResumeQueryAdapter,
): Promise<ApplicationResumeDocument | null> {
  const associatedResume = await adapter.findResume({
    organizationId,
    applicationId,
    candidateId,
    orderBy: RESUME_ORDER,
  })

  if (associatedResume) {
    return associatedResume
  }

  return adapter.findResume({
    organizationId,
    applicationId: null,
    candidateId,
    orderBy: RESUME_ORDER,
  })
}
