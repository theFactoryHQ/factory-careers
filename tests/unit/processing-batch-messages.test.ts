import { describe, expect, it } from 'vitest'
import type { ProcessingBatchResponse } from '../../shared/processing-batch'
import {
  documentProcessingBatchNotice,
  jobScoringBatchNotice,
} from '../../app/utils/processing-batch-messages'

function batch(
  status: ProcessingBatchResponse['status'],
  counts: Partial<ProcessingBatchResponse['counts']>,
): ProcessingBatchResponse {
  return {
    batchId: 'batch_1',
    type: 'application_analysis',
    status,
    counts: {
      pending: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      attempted: 0,
      total: 0,
      ...counts,
    },
    errorsByCode: {},
    createdAt: '2026-07-16T12:00:00.000Z',
    startedAt: null,
    completedAt: '2026-07-16T12:00:01.000Z',
    retryAfterMs: null,
  }
}

describe('processing batch dashboard notices', () => {
  it('distinguishes zero-work, complete, partial, failed, and cancelled scoring', () => {
    expect(jobScoringBatchNotice(batch('completed', { total: 0 }))).toEqual({
      type: 'info',
      title: 'All candidates scored',
      message: 'Every candidate already has a score.',
    })
    expect(jobScoringBatchNotice(batch('completed', { succeeded: 2, attempted: 2, total: 2 }))).toEqual({
      type: 'success',
      title: 'Scoring complete',
      message: '2 unscored candidates scored successfully.',
    })
    expect(jobScoringBatchNotice(batch('failed', { succeeded: 2, failed: 1, attempted: 3, total: 3 }))).toEqual({
      type: 'warning',
      title: 'Scoring partially complete',
      message: '2 scored, 1 failed. Review candidate documents and scoring settings before retrying.',
    })
    expect(jobScoringBatchNotice(batch('failed', { failed: 1, attempted: 1, total: 1 }))).toEqual({
      type: 'error',
      title: 'Scoring failed',
      message: 'No candidates were scored. Review candidate documents and scoring settings before retrying.',
    })
    expect(jobScoringBatchNotice(batch('cancelled', { succeeded: 1, cancelled: 1, attempted: 2, total: 2 }))).toEqual({
      type: 'warning',
      title: 'Scoring cancelled',
      message: '1 scored before the batch was cancelled.',
    })
  })

  it('uses sanitized document outcomes without claiming text was extracted', () => {
    expect(documentProcessingBatchNotice(
      batch('completed', { succeeded: 1, attempted: 1, total: 1 }),
      { id: 'doc_1', parseStatus: 'parsed', parseResultCode: null },
    )).toEqual({
      type: 'success',
      title: 'Resume parsed successfully',
      message: 'Extractable text is ready for analysis.',
    })
    expect(documentProcessingBatchNotice(
      batch('completed', { succeeded: 1, attempted: 1, total: 1 }),
      { id: 'doc_1', parseStatus: 'no_text', parseResultCode: 'no_extractable_text' },
    )).toEqual({
      type: 'warning',
      title: 'No extractable text found',
      message: 'The document may be image-based or contain only scanned pages.',
    })
    expect(documentProcessingBatchNotice(batch('completed', { succeeded: 1, attempted: 1, total: 1 }), null)).toEqual({
      type: 'success',
      title: 'Document reprocessing complete',
      message: 'The document processing status has been refreshed.',
    })
    expect(documentProcessingBatchNotice(batch('cancelled', { cancelled: 1, attempted: 1, total: 1 }))).toEqual({
      type: 'warning',
      title: 'Document parsing cancelled',
      message: 'The document was not changed.',
    })
    expect(documentProcessingBatchNotice(batch('failed', { failed: 1, attempted: 1, total: 1 }))).toEqual({
      type: 'error',
      title: 'Parse failed',
      message: 'Could not extract text from this document. It may be image-based or damaged.',
    })
  })
})
