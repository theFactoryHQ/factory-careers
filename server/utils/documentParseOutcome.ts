import type {
  DocumentParseError,
  DocumentParseResult,
  ParsedResume,
} from './resume-parser'

export type DocumentParsePersistence = {
  parsedContent: ParsedResume | null
  parseStatus: 'pending' | 'parsed' | 'no_text' | 'failed'
  parseResultCode: string | null
  parseRetryable: boolean | null
  parseAttemptedAt: Date
}

export function parseResultPersistence(
  result: DocumentParseResult,
  attemptedAt = new Date(),
): DocumentParsePersistence {
  if (result.kind === 'parsed') {
    return {
      parsedContent: result.content,
      parseStatus: 'parsed',
      parseResultCode: null,
      parseRetryable: null,
      parseAttemptedAt: attemptedAt,
    }
  }

  return {
    parsedContent: null,
    parseStatus: 'no_text',
    parseResultCode: result.code,
    parseRetryable: false,
    parseAttemptedAt: attemptedAt,
  }
}

export function parseFailurePersistence(
  error: DocumentParseError,
  exhausted: boolean,
  attemptedAt = new Date(),
): DocumentParsePersistence {
  return {
    parsedContent: null,
    parseStatus: error.retryable && !exhausted ? 'pending' : 'failed',
    parseResultCode: error.code,
    parseRetryable: error.retryable,
    parseAttemptedAt: attemptedAt,
  }
}
