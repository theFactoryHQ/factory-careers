import { describe, expect, it } from 'vitest'
import {
  INVALID_FILE_CONFIGS,
  VALID_FILE_CONFIGS,
} from '../../e2e/fixtures/test-buffers'
import { detectAllowedDocumentMimeType } from '../../server/utils/documentMime'

describe('document MIME detection', () => {
  it.each(VALID_FILE_CONFIGS)('accepts $label by inspecting file bytes', async (file) => {
    await expect(detectAllowedDocumentMimeType(file.buffer)).resolves.toBe(file.mimeType)
  })

  it.each(INVALID_FILE_CONFIGS)('rejects $label by inspecting file bytes', async (file) => {
    await expect(detectAllowedDocumentMimeType(file.buffer)).resolves.toBeNull()
  })

  it('does not trust a DOC filename or declared content type without OLE2 magic bytes', async () => {
    await expect(detectAllowedDocumentMimeType(Buffer.from('not really a doc'))).resolves.toBeNull()
  })

  it('rejects generic OLE2 compound files that are not identifiable as Word documents', async () => {
    const workbook = Buffer.alloc(512, 0)
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]).copy(workbook, 0)
    Buffer.from('Workbook', 'utf16le').copy(workbook, 64)

    await expect(detectAllowedDocumentMimeType(workbook)).resolves.toBeNull()
  })
})
