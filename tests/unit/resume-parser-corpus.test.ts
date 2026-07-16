import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DocumentParseError,
  parseDocumentDetailed,
} from '../../server/utils/resume-parser'

const fixture = (name: string) => readFileSync(join(
  process.cwd(),
  'tests/fixtures/resumes',
  name,
))

describe('resume parser format corpus', () => {
  it.each([
    {
      filename: 'compressed-multipage.pdf',
      markers: ['compressed multipage resume page one', 'compressed multipage resume page two'],
      pageCount: 2,
    },
    {
      filename: 'subset-font.pdf',
      markers: ['subset font resume'],
      pageCount: 1,
    },
    {
      filename: 'multi-column.pdf',
      markers: ['left column', 'right column'],
      pageCount: 1,
    },
  ])('extracts text from $filename', async ({ filename, markers, pageCount }) => {
    const result = await parseDocumentDetailed(fixture(filename), 'application/pdf')

    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') throw new Error(`${filename} did not produce parsed text`)
    for (const marker of markers) expect(result.content.text).toContain(marker)
    expect(result.content.metadata.pageCount).toBe(pageCount)
  })

  it.each([
    {
      filename: 'valid.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      marker: 'Factory Careers DOCX resume fixture',
      sourceFormat: 'docx',
    },
    {
      filename: 'valid.doc',
      mimeType: 'application/msword',
      marker: 'Factory Careers legacy DOC resume fixture',
      sourceFormat: 'doc',
    },
  ])('extracts text from $filename', async ({ filename, mimeType, marker, sourceFormat }) => {
    const result = await parseDocumentDetailed(fixture(filename), mimeType)

    expect(result.kind).toBe('parsed')
    if (result.kind !== 'parsed') throw new Error(`${filename} did not produce parsed text`)
    expect(result.content.text).toContain(marker)
    expect(result.content.metadata.sourceFormat).toBe(sourceFormat)
  })

  it('classifies an image-only PDF as no extractable text', async () => {
    const result = await parseDocumentDetailed(fixture('image-only.pdf'), 'application/pdf')

    expect(result).toEqual({
      kind: 'no_text',
      code: 'no_extractable_text',
      pageCount: 1,
    })
  })

  it('classifies a password-protected PDF as a non-retryable password failure', async () => {
    try {
      await parseDocumentDetailed(fixture('password-protected.pdf'), 'application/pdf')
      throw new Error('Expected password-protected PDF parsing to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(DocumentParseError)
      expect(error).toMatchObject({
        code: 'password_required',
        retryable: false,
      })
    }
  })

  it('classifies a truncated PDF through the actual parser as a non-retryable invalid PDF', async () => {
    try {
      await parseDocumentDetailed(fixture('truncated.pdf'), 'application/pdf')
      throw new Error('Expected truncated PDF parsing to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(DocumentParseError)
      expect(error).toMatchObject({
        code: 'invalid_pdf',
        retryable: false,
      })
      expect((error as DocumentParseError).cause).toMatchObject({
        name: 'InvalidPDFException',
      })
    }
  })
})
