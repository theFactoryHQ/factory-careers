import { describe, expect, it } from 'vitest'
import { processingBatchResponse } from '../../server/utils/processingResponse'

describe('processingBatchResponse', () => {
  it('returns only the public batch contract with ISO timestamps', () => {
    const response = processingBatchResponse({
      batchId: 'batch-1',
      type: 'document_parse',
      status: 'processing',
      counts: {
        pending: 1,
        processing: 2,
        succeeded: 3,
        failed: 1,
        cancelled: 0,
        attempted: 6,
        total: 7,
      },
      errorsByCode: { parser_timeout: 1 },
      retryAfterMs: 2_500,
      timestamps: {
        createdAt: new Date('2026-07-16T12:00:00.000Z'),
        startedAt: new Date('2026-07-16T12:00:01.000Z'),
        sealedAt: new Date('2026-07-16T12:00:02.000Z'),
        completedAt: null,
        updatedAt: new Date('2026-07-16T12:00:03.000Z'),
      },
    })

    expect(response).toEqual({
      batchId: 'batch-1',
      type: 'document_parse',
      status: 'processing',
      counts: {
        pending: 1,
        processing: 2,
        succeeded: 3,
        failed: 1,
        cancelled: 0,
        attempted: 6,
        total: 7,
      },
      errorsByCode: { parser_timeout: 1 },
      createdAt: '2026-07-16T12:00:00.000Z',
      startedAt: '2026-07-16T12:00:01.000Z',
      completedAt: null,
      retryAfterMs: 2_500,
    })
  })
})
