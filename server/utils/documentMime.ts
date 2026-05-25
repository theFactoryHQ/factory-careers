import { fileTypeFromBuffer } from 'file-type'
import { ALLOWED_MIME_TYPES } from './schemas/document'

export type AllowedDocumentMimeType = typeof ALLOWED_MIME_TYPES[number]

const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
const WORD_CFB_MARKERS = [
  Buffer.from('WordDocument', 'utf16le'),
  Buffer.from('0Table', 'utf16le'),
  Buffer.from('1Table', 'utf16le'),
]

function hasOle2Magic(buffer: Buffer): boolean {
  return buffer.length >= OLE2_MAGIC.length
    && Buffer.compare(buffer.subarray(0, OLE2_MAGIC.length), OLE2_MAGIC) === 0
}

function isLegacyWordDocument(buffer: Buffer): boolean {
  return hasOle2Magic(buffer)
    && WORD_CFB_MARKERS.some(marker => buffer.includes(marker))
}

export async function detectAllowedDocumentMimeType(buffer: Buffer): Promise<AllowedDocumentMimeType | null> {
  const detectedType = await fileTypeFromBuffer(buffer)
  let mimeType = detectedType?.mime

  if (!mimeType || mimeType === 'application/x-cfb') {
    if (isLegacyWordDocument(buffer)) {
      mimeType = 'application/msword'
    }
  }

  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as AllowedDocumentMimeType)) {
    return null
  }

  return mimeType as AllowedDocumentMimeType
}
