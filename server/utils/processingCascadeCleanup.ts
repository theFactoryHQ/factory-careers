import { and, asc, eq, inArray } from 'drizzle-orm'
import { application, candidate, document, job } from '../database/schema'
import {
  cancelDocumentProcessingTasksInTransaction,
  cancelProcessingTasksInTransaction,
  type ProcessingQueueDatabaseExecutor,
} from './processingQueue'

export type ProcessingCascadeDocument = {
  id: string
  storageKey: string
}

export type CandidateProcessingCascade = {
  candidateIds: string[]
  applicationIds: string[]
  documents: ProcessingCascadeDocument[]
}

export async function prepareCandidateProcessingCascadeInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: { organizationId: string; candidateIds: string[] },
): Promise<CandidateProcessingCascade> {
  const requestedCandidateIds = [...new Set(input.candidateIds)].sort()
  if (requestedCandidateIds.length === 0) {
    return { candidateIds: [], applicationIds: [], documents: [] }
  }

  // Parent rows close the child set. Their deterministic order is important for
  // multi-candidate privacy requests that overlap with another deletion.
  const lockedCandidates = await executor.select({ id: candidate.id })
    .from(candidate)
    .where(and(
      eq(candidate.organizationId, input.organizationId),
      inArray(candidate.id, requestedCandidateIds),
    ))
    .orderBy(asc(candidate.id))
    .for('update')
  const candidateIds = lockedCandidates.map(row => row.id)
  if (candidateIds.length === 0) {
    return { candidateIds: [], applicationIds: [], documents: [] }
  }

  const applications = await executor.select({ id: application.id })
    .from(application)
    .where(and(
      eq(application.organizationId, input.organizationId),
      inArray(application.candidateId, candidateIds),
    ))
    .orderBy(asc(application.id))
  const applicationIds = applications.map(row => row.id)

  await cancelProcessingTasksInTransaction(executor, {
    organizationId: input.organizationId,
    targets: applicationIds.map(resourceId => ({
      type: 'application_analysis' as const,
      resourceId,
    })),
    resultCode: 'resource_removed',
  })

  // Discover documents only after application resources are locked. Together
  // with the candidate parent locks, this makes the child set stable.
  const documents = await executor.select({
    id: document.id,
    storageKey: document.storageKey,
  })
    .from(document)
    .where(and(
      eq(document.organizationId, input.organizationId),
      inArray(document.candidateId, candidateIds),
    ))
    .orderBy(asc(document.id))

  await cancelDocumentProcessingTasksInTransaction(executor, {
    organizationId: input.organizationId,
    documentIds: documents.map(row => row.id),
  })

  return { candidateIds, applicationIds, documents }
}

export type JobProcessingCascade = {
  jobId: string
  applicationIds: string[]
}

export async function prepareJobProcessingCascadeInTransaction(
  executor: ProcessingQueueDatabaseExecutor,
  input: { organizationId: string; jobId: string },
): Promise<JobProcessingCascade | null> {
  const [lockedJob] = await executor.select({ id: job.id })
    .from(job)
    .where(and(
      eq(job.organizationId, input.organizationId),
      eq(job.id, input.jobId),
    ))
    .limit(1)
    .for('update')
  if (!lockedJob) return null

  const applications = await executor.select({ id: application.id })
    .from(application)
    .where(and(
      eq(application.organizationId, input.organizationId),
      eq(application.jobId, input.jobId),
    ))
    .orderBy(asc(application.id))
  const applicationIds = applications.map(row => row.id)

  await cancelProcessingTasksInTransaction(executor, {
    organizationId: input.organizationId,
    targets: applicationIds.map(resourceId => ({
      type: 'application_analysis' as const,
      resourceId,
    })),
    resultCode: 'resource_removed',
  })

  return {
    jobId: lockedJob.id,
    applicationIds,
  }
}
