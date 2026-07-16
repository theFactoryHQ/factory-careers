import { describe, expect, it } from 'vitest'
import { DocumentParseError } from '../../server/utils/resume-parser'
import {
  parseFailurePersistence,
  parseResultPersistence,
} from '../../server/utils/documentParseOutcome'

const attemptedAt = new Date('2026-07-16T12:00:00.000Z')

describe('document parse persistence outcomes', () => {
  it('persists extracted content as parsed', () => {
    const content = {
      text: 'Ada Lovelace',
      sections: [],
      metadata: {
        pageCount: 1,
        wordCount: 2,
        characterCount: 12,
        extractedAt: attemptedAt.toISOString(),
        parserVersion: '1.1',
        sourceFormat: 'pdf' as const,
      },
    }

    expect(parseResultPersistence({ kind: 'parsed', content }, attemptedAt)).toEqual({
      parsedContent: content,
      parseStatus: 'parsed',
      parseResultCode: null,
      parseRetryable: null,
      parseAttemptedAt: attemptedAt,
    })
  })

  it('preserves a legitimate text-free result as completed no-text', () => {
    expect(parseResultPersistence({
      kind: 'no_text',
      code: 'no_extractable_text',
      pageCount: 2,
    }, attemptedAt)).toEqual({
      parsedContent: null,
      parseStatus: 'no_text',
      parseResultCode: 'no_extractable_text',
      parseRetryable: false,
      parseAttemptedAt: attemptedAt,
    })
  })

  it('keeps retryable failures pending until attempts are exhausted', () => {
    const error = new DocumentParseError('parser_timeout', true, new Error('private detail'))

    expect(parseFailurePersistence(error, false, attemptedAt)).toEqual({
      parsedContent: null,
      parseStatus: 'pending',
      parseResultCode: 'parser_timeout',
      parseRetryable: true,
      parseAttemptedAt: attemptedAt,
    })
    expect(parseFailurePersistence(error, true, attemptedAt)).toEqual({
      parsedContent: null,
      parseStatus: 'failed',
      parseResultCode: 'parser_timeout',
      parseRetryable: true,
      parseAttemptedAt: attemptedAt,
    })
  })

  it('marks permanent parser failures failed immediately', () => {
    const error = new DocumentParseError('password_required', false, new Error('private detail'))

    expect(parseFailurePersistence(error, false, attemptedAt)).toEqual({
      parsedContent: null,
      parseStatus: 'failed',
      parseResultCode: 'password_required',
      parseRetryable: false,
      parseAttemptedAt: attemptedAt,
    })
  })
})
