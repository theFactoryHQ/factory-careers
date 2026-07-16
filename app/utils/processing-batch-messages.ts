import type { ProcessingBatchResponse } from '~~/shared/processing-batch'

type ProcessingBatchNotice = {
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  message: string
}

export type DocumentParseProjection = {
  id: string
  parseStatus: 'pending' | 'parsed' | 'no_text' | 'failed'
  parseResultCode: string | null
}

type ApplicationDocumentProjectionResponse = {
  candidate: {
    documents: DocumentParseProjection[]
  }
}

export function jobScoringBatchNotice(batch: ProcessingBatchResponse): ProcessingBatchNotice {
  if (batch.counts.total === 0) {
    return {
      type: 'info',
      title: 'All candidates scored',
      message: 'Every candidate already has a score.',
    }
  }
  if (batch.status === 'completed') {
    return {
      type: 'success',
      title: 'Scoring complete',
      message: `${batch.counts.succeeded} unscored candidate${batch.counts.succeeded === 1 ? '' : 's'} scored successfully.`,
    }
  }
  if (batch.status === 'failed' && batch.counts.succeeded > 0) {
    return {
      type: 'warning',
      title: 'Scoring partially complete',
      message: `${batch.counts.succeeded} scored, ${batch.counts.failed} failed. Review candidate documents and scoring settings before retrying.`,
    }
  }
  if (batch.status === 'cancelled') {
    return {
      type: 'warning',
      title: 'Scoring cancelled',
      message: `${batch.counts.succeeded} scored before the batch was cancelled.`,
    }
  }
  return {
    type: 'error',
    title: 'Scoring failed',
    message: 'No candidates were scored. Review candidate documents and scoring settings before retrying.',
  }
}

export function documentProcessingBatchNotice(
  batch: ProcessingBatchResponse,
  documentState?: DocumentParseProjection | null,
): ProcessingBatchNotice {
  if (batch.status === 'completed') {
    if (documentState?.parseStatus === 'parsed') {
      return {
        type: 'success',
        title: 'Resume parsed successfully',
        message: 'Extractable text is ready for analysis.',
      }
    }
    if (documentState?.parseStatus === 'no_text') {
      return {
        type: 'warning',
        title: 'No extractable text found',
        message: 'The document may be image-based or contain only scanned pages.',
      }
    }
    if (documentState?.parseStatus === 'failed') {
      return {
        type: 'error',
        title: 'Parse failed',
        message: 'Could not extract text from this document. It may be image-based or damaged.',
      }
    }
    return {
      type: 'success',
      title: 'Document reprocessing complete',
      message: 'The document processing status has been refreshed.',
    }
  }
  if (batch.status === 'cancelled') {
    return {
      type: 'warning',
      title: 'Document parsing cancelled',
      message: 'The document was not changed.',
    }
  }
  return {
    type: 'error',
    title: 'Parse failed',
    message: 'Could not extract text from this document. It may be image-based or damaged.',
  }
}

export async function loadApplicationDocumentParseState(
  applicationId: string,
  documentId: string,
): Promise<DocumentParseProjection | null> {
  const response = await $fetch<ApplicationDocumentProjectionResponse>(
    `/api/applications/${encodeURIComponent(applicationId)}`,
    { headers: useRequestHeaders(['cookie']) },
  )

  return response.candidate.documents.find(document => document.id === documentId) ?? null
}
