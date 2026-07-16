import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import {
  DocumentParseError,
  parseDocument,
  parseDocumentDetailed,
  extractResumeText,
  type DocumentParseDependencies,
  type ParsedResume,
} from '../../server/utils/resume-parser'

/**
 * Create a minimal valid PDF containing the given text.
 * Uses a simple Type1/Helvetica font and a single page.
 */
function createTestPdf(text: string): Buffer {
  const streamContent = `BT /F1 12 Tf 72 700 Td (${text}) Tj ET`

  const content = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    'endobj',
    `4 0 obj`,
    `<< /Length ${streamContent.length} >>`,
    'stream',
    streamContent,
    'endstream',
    'endobj',
    '5 0 obj',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    'endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000266 00000 n ',
    '0000000360 00000 n ',
    'trailer',
    '<< /Size 6 /Root 1 0 R >>',
    'startxref',
    '441',
    '%%EOF',
  ].join('\n')

  return Buffer.from(content)
}

function pdfDependencies(options: {
  text?: string
  total?: number
  getTextError?: Error
  destroyError?: Error
}) {
  const destroy = vi.fn(async () => {
    if (options.destroyError) throw options.destroyError
  })
  const getText = vi.fn(async () => {
    if (options.getTextError) throw options.getTextError
    return { text: options.text ?? '', total: options.total ?? 1 }
  })
  const dependencies: DocumentParseDependencies = {
    createPdfParser: vi.fn(async () => ({ getText, destroy })),
  }

  return { dependencies, destroy, getText }
}

function namedError(name: string, message = name) {
  const error = new Error(message)
  error.name = name
  return error
}

// ─── Tests ───────────────────────────────────────────────────────

describe('resume-parser', () => {
  describe('parseDocumentDetailed', () => {
    it('distinguishes parsed content from a document with no extractable text', async () => {
      const parsedHarness = pdfDependencies({ text: 'Ada Lovelace', total: 2 })
      const parsed = await parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        parsedHarness.dependencies,
      )

      expect(parsed).toMatchObject({
        kind: 'parsed',
        content: {
          text: 'Ada Lovelace',
          metadata: { pageCount: 2 },
        },
      })
      expect(parsedHarness.destroy).toHaveBeenCalledTimes(1)

      const noTextHarness = pdfDependencies({ text: ' \n\t ', total: 3 })
      const noText = await parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        noTextHarness.dependencies,
      )

      expect(noText).toEqual({
        kind: 'no_text',
        code: 'no_extractable_text',
        pageCount: 3,
      })
      expect(noTextHarness.destroy).toHaveBeenCalledTimes(1)
    })

    it.each([
      { label: 'empty bytes', buffer: Buffer.alloc(0), mimeType: 'application/pdf', code: 'empty_file', retryable: false },
      { label: 'unsupported MIME', buffer: Buffer.from('text'), mimeType: 'text/plain', code: 'unsupported_mime', retryable: false },
    ])('throws a stable typed failure for $label', async ({ buffer, mimeType, code, retryable }) => {
      await expect(parseDocumentDetailed(buffer, mimeType)).rejects.toMatchObject({
        name: 'DocumentParseError',
        code,
        retryable,
      })
    })

    it.each([
      { error: namedError('PasswordException'), code: 'password_required', retryable: false },
      { error: namedError('InvalidPDFException'), code: 'invalid_pdf', retryable: false },
      { error: namedError('FormatError'), code: 'malformed_pdf', retryable: false },
      { error: namedError('SyntaxError'), code: 'parser_runtime_error', retryable: true },
      { error: namedError('AbortException'), code: 'parser_aborted', retryable: true },
      { error: namedError('TimeoutError'), code: 'parser_timeout', retryable: true },
      { error: namedError('Error'), code: 'parser_runtime_error', retryable: true },
    ])('classifies $error.name as $code and destroys once', async ({ error, code, retryable }) => {
      const harness = pdfDependencies({ getTextError: error })

      await expect(parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        harness.dependencies,
      )).rejects.toMatchObject({
        name: 'DocumentParseError',
        code,
        retryable,
        cause: error,
      })
      expect(harness.destroy).toHaveBeenCalledTimes(1)
    })

    it('keeps the primary parse failure when cleanup also fails', async () => {
      const primaryError = namedError('InvalidPDFException', 'primary extraction failure')
      const harness = pdfDependencies({
        getTextError: primaryError,
        destroyError: new Error('cleanup failure'),
      })

      await expect(parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        harness.dependencies,
      )).rejects.toMatchObject({
        code: 'invalid_pdf',
        retryable: false,
        cause: primaryError,
      })
      expect(harness.destroy).toHaveBeenCalledTimes(1)
    })

    it('does not discard parsed content when cleanup fails', async () => {
      const harness = pdfDependencies({
        text: 'Grace Hopper',
        destroyError: new Error('cleanup failure'),
      })

      await expect(parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        harness.dependencies,
      )).resolves.toMatchObject({ kind: 'parsed', content: { text: 'Grace Hopper' } })
      expect(harness.destroy).toHaveBeenCalledTimes(1)
    })

    it('exposes failures as DocumentParseError instances', async () => {
      try {
        await parseDocumentDetailed(Buffer.alloc(0), 'application/pdf')
        throw new Error('Expected parseDocumentDetailed to throw')
      }
      catch (error) {
        expect(error).toBeInstanceOf(DocumentParseError)
      }
    })

    it('keeps the dependency cause available internally but out of serialization', () => {
      const error = new DocumentParseError(
        'parser_runtime_error',
        true,
        { message: 'raw dependency failure' },
      )

      expect(error.cause).toEqual({ message: 'raw dependency failure' })
      expect(JSON.stringify(error)).not.toContain('raw dependency failure')
    })

    it('aborts a hung PDF parse on timeout and destroys the parser exactly once', async () => {
      const destroy = vi.fn(async () => {})
      const dependencies = {
        createPdfParser: vi.fn(async () => ({
          getText: vi.fn(() => new Promise<never>(() => {})),
          destroy,
        })),
        timeoutMs: 5,
      }

      await expect(parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        dependencies,
      )).rejects.toMatchObject({ code: 'parser_timeout', retryable: true })
      expect(destroy).toHaveBeenCalledTimes(1)
    })

    it('times out when PDF parser creation never resolves', async () => {
      const createPdfParser = vi.fn(() => new Promise<never>(() => undefined))

      await expect(parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        { createPdfParser, timeoutMs: 5 },
      )).rejects.toMatchObject({ code: 'parser_timeout', retryable: true })
      expect(createPdfParser).toHaveBeenCalledOnce()
    })

    it('destroys a PDF parser exactly once when creation resolves after timeout', async () => {
      let resolveParser!: (parser: {
        getText: () => Promise<{ text: string; total: number }>
        destroy: () => Promise<void>
      }) => void
      const destroy = vi.fn(async () => undefined)
      const createPdfParser = vi.fn(() => new Promise<{
        getText: () => Promise<{ text: string; total: number }>
        destroy: () => Promise<void>
      }>((resolve) => { resolveParser = resolve }))

      await expect(parseDocumentDetailed(
        Buffer.from('pdf bytes'),
        'application/pdf',
        { createPdfParser, timeoutMs: 5 },
      )).rejects.toMatchObject({ code: 'parser_timeout', retryable: true })
      resolveParser({
        getText: vi.fn(async () => ({ text: 'late', total: 1 })),
        destroy,
      })
      await vi.waitFor(() => expect(destroy).toHaveBeenCalledTimes(1))
    })

    it('honors an external abort signal and destroys the PDF parser exactly once', async () => {
      const controller = new AbortController()
      const destroy = vi.fn(async () => {})
      const dependencies = {
        createPdfParser: vi.fn(async () => ({
          getText: vi.fn(() => new Promise<never>(() => {})),
          destroy,
        })),
        abortSignal: controller.signal,
      }
      const parsing = parseDocumentDetailed(Buffer.from('pdf bytes'), 'application/pdf', dependencies)
      controller.abort()

      await expect(parsing).rejects.toMatchObject({ code: 'parser_aborted', retryable: true })
      expect(destroy).toHaveBeenCalledTimes(1)
    })
  })

  describe('parseDocument', () => {
    it('returns null for unsupported MIME types', async () => {
      const buffer = Buffer.from('test content')
      const result = await parseDocument(buffer, 'text/plain')
      expect(result).toBeNull()
    })

    it('returns null for empty buffer', async () => {
      const buffer = Buffer.alloc(0)
      const result = await parseDocument(buffer, 'application/pdf')
      expect(result).toBeNull()
    })

    it('returns null for corrupted data without crashing', async () => {
      const buffer = Buffer.from('not a real pdf file content')
      const result = await parseDocument(buffer, 'application/pdf')
      expect(result).toBeNull()
    })

    it('parses a valid PDF and returns structured content', async () => {
      const pdf = createTestPdf('John Doe Software Engineer')
      const result = await parseDocument(pdf, 'application/pdf')

      expect(result).not.toBeNull()
      expect(result!.text).toContain('John Doe')
      expect(result!.metadata.sourceFormat).toBe('pdf')
      expect(result!.metadata.parserVersion).toBe('1.1')
      expect(result!.metadata.wordCount).toBeGreaterThan(0)
      expect(result!.metadata.extractedAt).toBeTruthy()
      expect(result!.metadata.pageCount).toBe(1)
    })

    it('handles DOCX mime type gracefully with invalid data', async () => {
      const buffer = Buffer.from('not a real docx')
      const result = await parseDocument(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      expect(result).toBeNull()
    })

    it('handles DOC mime type gracefully with invalid data', async () => {
      const buffer = Buffer.from('not a real doc')
      const result = await parseDocument(buffer, 'application/msword')
      expect(result).toBeNull()
    })
  })

  describe('extractResumeText', () => {
    it('returns null for null input', () => {
      expect(extractResumeText(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(extractResumeText(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractResumeText('')).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(extractResumeText('   ')).toBeNull()
    })

    it('extracts text from structured ParsedResume format', () => {
      const parsed: ParsedResume = {
        text: 'John Doe\nSoftware Engineer\n\nExperience\n5 years at Google',
        sections: [{ heading: 'Experience', content: '5 years at Google' }],
        metadata: {
          pageCount: 1,
          wordCount: 10,
          characterCount: 50,
          extractedAt: '2024-01-01T00:00:00Z',
          parserVersion: '1.0',
          sourceFormat: 'pdf',
        },
      }

      const result = extractResumeText(parsed)
      expect(result).toBe('John Doe\nSoftware Engineer\n\nExperience\n5 years at Google')
    })

    it('handles legacy plain string values', () => {
      const result = extractResumeText('This is a resume text')
      expect(result).toBe('This is a resume text')
    })

    it('falls back to JSON.stringify for unknown object shapes', () => {
      const result = extractResumeText({ foo: 'bar' })
      expect(result).toBe('{"foo":"bar"}')
    })

    it('returns null for empty objects', () => {
      expect(extractResumeText({})).toBeNull()
    })

    it('returns null for empty arrays', () => {
      expect(extractResumeText([])).toBeNull()
    })

    it('handles structured format with empty text', () => {
      const parsed = { text: '', sections: [], metadata: {} }
      const result = extractResumeText(parsed)
      // Empty text should return null (falls through to stringify)
      expect(result).toBeNull()
    })
  })

  describe('document parse persistence contract', () => {
    it('stores stable outcomes without persisting raw parser messages', () => {
      const parserSource = readFileSync(join(process.cwd(), 'server/utils/resume-parser.ts'), 'utf8')
      const schema = readFileSync(join(process.cwd(), 'server/database/schema/app.ts'), 'utf8')
      const migrationPath = join(process.cwd(), 'server/database/migrations/0055_document_parse_outcomes.sql')
      const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
      const journal = readFileSync(join(
        process.cwd(),
        'server/database/migrations/meta/_journal.json',
      ), 'utf8')

      expect(schema).toContain("export const documentParseStatusEnum = pgEnum('document_parse_status', [")
      expect(schema).toContain("'pending', 'parsed', 'no_text', 'failed'")
      expect(schema).toContain("parseStatus: documentParseStatusEnum('parse_status').notNull().default('pending')")
      expect(schema).toContain("parseResultCode: text('parse_result_code')")
      expect(schema).toContain("parseRetryable: boolean('parse_retryable')")
      expect(schema).toContain("parseAttemptedAt: timestamp('parse_attempted_at')")

      expect(migration).toContain('CREATE TYPE "public"."document_parse_status" AS ENUM')
      expect(migration).toContain('ADD COLUMN "parse_status"')
      expect(migration).toContain('ADD COLUMN "parse_result_code" text')
      expect(migration).toContain('ADD COLUMN "parse_retryable" boolean')
      expect(migration).toContain('ADD COLUMN "parse_attempted_at" timestamp')
      expect(migration).toContain('WHERE "parsed_content" IS NOT NULL')
      expect(migration).not.toContain('failure_message')
      expect(parserSource).not.toContain('error_message: errorMessage(')
      expect(journal).toContain('"tag": "0055_document_parse_outcomes"')
    })
  })
})
