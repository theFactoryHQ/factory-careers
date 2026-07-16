/**
 * Resume Parser
 *
 * Extracts text content from uploaded documents (PDF, DOCX, DOC).
 * Returns structured parsed content for storage in document.parsedContent.
 *
 * Supports:
 *   - PDF — via pdf-parse (pdfjs-dist based)
 *   - DOCX — via mammoth (XML-based, reliable)
 *   - DOC — via word-extractor (OLE2 compound documents)
 */
import mammoth from 'mammoth'
// @ts-ignore — word-extractor has no bundled type declarations
import WordExtractor from 'word-extractor'

// pdfjs-dist uses browser APIs (DOMMatrix, Path2D, ImageData) at module scope.
// In Node.js these don't exist, so we install minimal stubs before importing.
// We only use pdfjs-dist for text extraction — no actual rendering is needed.
function ensurePdfjsPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // Minimal 6-value identity matrix stub — enough for pdfjs-dist text layer
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    } as any
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      data: Uint8ClampedArray; width: number; height: number
      constructor(w: number, h: number) {
        this.width = w; this.height = h
        this.data = new Uint8ClampedArray(w * h * 4)
      }
    } as any
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {} as any
  }
}

const PARSER_VERSION = '1.1'

export type DocumentParseErrorCode
  = | 'empty_file'
    | 'unsupported_mime'
    | 'password_required'
    | 'invalid_pdf'
    | 'malformed_pdf'
    | 'parser_aborted'
    | 'parser_timeout'
    | 'parser_runtime_error'

const PARSE_ERROR_MESSAGES: Record<DocumentParseErrorCode, string> = {
  empty_file: 'The uploaded document is empty',
  unsupported_mime: 'The uploaded document type is not supported',
  password_required: 'The PDF requires a password',
  invalid_pdf: 'The uploaded PDF is invalid',
  malformed_pdf: 'The uploaded PDF is malformed',
  parser_aborted: 'Document parsing was aborted',
  parser_timeout: 'Document parsing timed out',
  parser_runtime_error: 'The document parser encountered a runtime error',
}

export class DocumentParseError extends Error {
  readonly code: DocumentParseErrorCode
  readonly retryable: boolean
  override readonly cause: unknown

  constructor(code: DocumentParseErrorCode, retryable: boolean, cause: unknown) {
    super(PARSE_ERROR_MESSAGES[code], { cause })
    this.name = 'DocumentParseError'
    this.code = code
    this.retryable = retryable
    Object.defineProperty(this, 'cause', {
      value: cause,
      enumerable: false,
      configurable: false,
      writable: false,
    })
  }
}

export interface ParsedResume {
  /** Full extracted text content */
  text: string
  /** Detected sections (best-effort heuristic) */
  sections: ResumeSection[]
  /** Parsing metadata */
  metadata: {
    pageCount: number | null
    wordCount: number
    characterCount: number
    extractedAt: string
    parserVersion: string
    sourceFormat: 'pdf' | 'docx' | 'doc'
  }
}

export interface ResumeSection {
  heading: string
  content: string
}

export type DocumentParseResult =
  | { kind: 'parsed'; content: ParsedResume }
  | { kind: 'no_text'; code: 'no_extractable_text'; pageCount: number | null }

interface PdfTextParser {
  getText: (options?: { pageJoiner?: string }) => Promise<{ text: string; total: number }>
  destroy: () => Promise<void>
}

export interface DocumentParseDependencies {
  createPdfParser?: (buffer: Buffer) => Promise<PdfTextParser>
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
])

function errorName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) return ''
  return String(error.name)
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  return String(error.code)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function classifyParseError(error: unknown, mimeType: string): DocumentParseError {
  if (error instanceof DocumentParseError) return error

  const name = errorName(error)
  const code = errorCode(error)
  const message = errorMessage(error)

  if (name === 'AbortException' || name === 'AbortError' || code === 'ABORT_ERR') {
    return new DocumentParseError('parser_aborted', true, error)
  }
  if (
    name === 'TimeoutError'
    || code === 'ETIMEDOUT'
    || /(?:timed?\s*out|timeout)/i.test(message)
  ) {
    return new DocumentParseError('parser_timeout', true, error)
  }

  if (mimeType === 'application/pdf') {
    if (name === 'PasswordException' || /password (?:is )?(?:required|needed)/i.test(message)) {
      return new DocumentParseError('password_required', false, error)
    }
    if (name === 'InvalidPDFException') {
      return new DocumentParseError('invalid_pdf', false, error)
    }
    if (name === 'FormatError') {
      return new DocumentParseError('malformed_pdf', false, error)
    }
  }

  return new DocumentParseError('parser_runtime_error', true, error)
}

async function createDefaultPdfParser(buffer: Buffer): Promise<PdfTextParser> {
  // Polyfill browser globals before pdfjs-dist evaluates its module-level code.
  ensurePdfjsPolyfills()
  const { PDFParse } = await import('pdf-parse')
  return new PDFParse({ data: buffer })
}

/**
 * Parse a document while preserving the distinction between usable text,
 * legitimately text-free content, and a typed operational failure.
 */
export async function parseDocumentDetailed(
  buffer: Buffer,
  mimeType: string,
  dependencies: DocumentParseDependencies = {},
): Promise<DocumentParseResult> {
  if (buffer.length === 0) {
    throw new DocumentParseError('empty_file', false, new Error('Document buffer is empty'))
  }
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new DocumentParseError(
      'unsupported_mime',
      false,
      new Error(`Unsupported document MIME type: ${mimeType}`),
    )
  }

  try {
    switch (mimeType) {
      case 'application/pdf':
        return await parsePdf(buffer, dependencies.createPdfParser ?? createDefaultPdfParser)
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await parseDocx(buffer)
      case 'application/msword':
        return await parseDoc(buffer)
      default:
        // The supported MIME precondition above makes this unreachable, while
        // keeping the switch exhaustive if another format is added later.
        throw new DocumentParseError('unsupported_mime', false, new Error(mimeType))
    }
  }
  catch (error) {
    throw classifyParseError(error, mimeType)
  }
}

/**
 * Parse a document buffer and extract text content.
 * Routes to the appropriate parser based on MIME type.
 *
 * @param buffer - Raw file bytes
 * @param mimeType - Validated MIME type of the document
 * @returns Structured parsed content, or null if extraction fails
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<ParsedResume | null> {
  try {
    const result = await parseDocumentDetailed(buffer, mimeType)
    return result.kind === 'parsed' ? result.content : null
  }
  catch (error) {
    const parseError = classifyParseError(error, mimeType)
    if (parseError.code === 'unsupported_mime') {
      logWarn('resume_parser.unsupported_mime_type', {
        mime_type: mimeType,
      })
      return null
    }
    logError('resume_parser.parse_failed', {
      mime_type: mimeType,
      error_code: parseError.code,
      retryable: parseError.retryable,
    })
    return null
  }
}

// ─── PDF Parser ───────────────────────────────────────────────────

async function parsePdf(
  buffer: Buffer,
  createPdfParser: (buffer: Buffer) => Promise<PdfTextParser>,
): Promise<DocumentParseResult> {
  let parser: PdfTextParser | undefined

  try {
    parser = await createPdfParser(buffer)
    // pdf-parse's default page joiner includes synthetic `-- N of N --`
    // markers. Disable it so an image-only PDF is not mistaken for text.
    const result = await parser.getText({ pageJoiner: '' })
    const text = normalizeText(result.text)

    if (!text) {
      return {
        kind: 'no_text',
        code: 'no_extractable_text',
        pageCount: result.total,
      }
    }

    return {
      kind: 'parsed',
      content: {
        text,
        sections: extractSections(text),
        metadata: {
          pageCount: result.total,
          wordCount: countWords(text),
          characterCount: text.length,
          extractedAt: new Date().toISOString(),
          parserVersion: PARSER_VERSION,
          sourceFormat: 'pdf',
        },
      },
    }
  }
  finally {
    if (parser) {
      try {
        await parser.destroy()
      }
      catch (cleanupError) {
        // Cleanup must never replace a successful parse/no-text classification
        // or the primary extraction error thrown from the try block.
        logError('resume_parser.cleanup_failed', {
          source_format: 'pdf',
          error_name: errorName(cleanupError),
        })
      }
    }
  }
}

// ─── DOCX Parser ──────────────────────────────────────────────────

async function parseDocx(buffer: Buffer): Promise<DocumentParseResult> {
  const result = await mammoth.extractRawText({ buffer })

  const text = normalizeText(result.value)
  if (!text) {
    return { kind: 'no_text', code: 'no_extractable_text', pageCount: null }
  }

  return {
    kind: 'parsed',
    content: {
      text,
      sections: extractSections(text),
      metadata: {
        pageCount: null, // DOCX doesn't have pages
        wordCount: countWords(text),
        characterCount: text.length,
        extractedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
        sourceFormat: 'docx',
      },
    },
  }
}

// ─── DOC Parser (Legacy) ──────────────────────────────────────────

async function parseDoc(buffer: Buffer): Promise<DocumentParseResult> {
  const extractor = new WordExtractor()
  const doc = await extractor.extract(buffer)

  // Combine main body, headers, and footers
  const parts = [
    doc.getBody(),
    doc.getHeaders({ includeFooters: false }),
    doc.getFooters(),
  ].filter(Boolean)

  const rawText = parts.join('\n')
  const text = normalizeText(rawText)
  if (!text) {
    return { kind: 'no_text', code: 'no_extractable_text', pageCount: null }
  }

  return {
    kind: 'parsed',
    content: {
      text,
      sections: extractSections(text),
      metadata: {
        pageCount: null,
        wordCount: countWords(text),
        characterCount: text.length,
        extractedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
        sourceFormat: 'doc',
      },
    },
  }
}

// ─── Text Normalization ───────────────────────────────────────────

/**
 * Clean up extracted text: collapse whitespace, trim, remove control chars.
 * Returns empty string if no meaningful content was extracted.
 */
function normalizeText(raw: string): string {
  return raw
    // Remove null bytes and control characters (except newline/tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize Windows line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces/tabs on same line into one
    .replace(/[^\S\n]+/g, ' ')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim()
}

// ─── Section Extraction ───────────────────────────────────────────

/**
 * Best-effort extraction of resume sections based on common heading patterns.
 * This is a heuristic approach — not all resumes follow standard formats.
 */
const SECTION_HEADINGS = [
  // Experience / Work
  /^(?:work\s*)?experience/i,
  /^employment\s*(?:history)?/i,
  /^professional\s*(?:experience|background|history)/i,
  /^career\s*(?:history|summary)/i,
  /^work\s*history/i,

  // Education
  /^education(?:al\s*background)?/i,
  /^academic\s*(?:background|qualifications)/i,
  /^qualifications/i,

  // Skills
  /^(?:technical\s*)?skills/i,
  /^core\s*competencies/i,
  /^technologies/i,
  /^tools?\s*(?:&|and)\s*technologies/i,
  /^expertise/i,

  // Summary / Profile / Objective
  /^(?:professional\s*)?summary/i,
  /^(?:career\s*)?objective/i,
  /^profile/i,
  /^about\s*(?:me)?/i,

  // Certifications / Awards
  /^certifications?/i,
  /^licenses?\s*(?:&|and)\s*certifications?/i,
  /^awards?\s*(?:&|and)\s*(?:honors?|achievements?)/i,
  /^achievements?/i,
  /^honors?/i,

  // Projects / Publications
  /^(?:key\s*)?projects?/i,
  /^publications?/i,
  /^research/i,
  /^portfolio/i,

  // Languages / Interests
  /^languages?/i,
  /^interests?\s*(?:&|and)\s*(?:hobbies|activities)/i,
  /^hobbies/i,
  /^volunteer(?:ing)?\s*(?:experience)?/i,

  // References
  /^references?/i,

  // Contact
  /^contact\s*(?:information|details)?/i,
  /^personal\s*(?:information|details)/i,
]

function extractSections(text: string): ResumeSection[] {
  const lines = text.split('\n')
  const sections: ResumeSection[] = []
  let currentHeading: string | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      currentContent.push('')
      continue
    }

    // Check if this line matches a known section heading pattern
    // Headings are typically short (< 60 chars) and on their own line
    const isHeading = trimmed.length < 60 && SECTION_HEADINGS.some(pattern => pattern.test(trimmed))

    if (isHeading) {
      // Save previous section
      if (currentHeading !== null) {
        const content = currentContent.join('\n').trim()
        if (content) {
          sections.push({ heading: currentHeading, content })
        }
      }
      currentHeading = trimmed
      currentContent = []
    }
    else {
      currentContent.push(trimmed)
    }
  }

  // Save last section
  if (currentHeading !== null) {
    const content = currentContent.join('\n').trim()
    if (content) {
      sections.push({ heading: currentHeading, content })
    }
  }

  return sections
}

// ─── Helpers ──────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// ─── Resume Text Extraction ──────────────────────────────────────

/**
 * Extract plain text from a parsedContent JSONB value.
 * Handles both the structured ParsedResume format and legacy string values.
 * Used by the scoring/analysis endpoints.
 *
 * @param parsedContent - The raw JSONB value from document.parsedContent
 * @returns The extracted text, or null if no content is available
 */
export function extractResumeText(parsedContent: unknown): string | null {
  if (!parsedContent) return null

  // Structured ParsedResume format: { text: "...", sections: [...], metadata: {...} }
  if (typeof parsedContent === 'object' && 'text' in parsedContent) {
    const text = (parsedContent as { text: unknown }).text
    if (typeof text === 'string' && text.trim()) return text
    // If it has a text property but it's empty, there's no useful content
    return null
  }

  // Legacy: plain string value
  if (typeof parsedContent === 'string' && parsedContent.trim()) {
    return parsedContent
  }

  // Fallback: stringify object (should rarely happen)
  if (typeof parsedContent === 'object') {
    const str = JSON.stringify(parsedContent)
    return str && str !== '{}' && str !== '[]' ? str : null
  }

  return null
}
