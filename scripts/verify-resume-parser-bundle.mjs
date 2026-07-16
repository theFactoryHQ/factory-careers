import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const smokeTestText = 'Factory Careers PDF parser smoke test'

function createSmokeTestPdf() {
  const stream = `BT /F1 12 Tf 72 700 Td (${smokeTestText}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += object
  }

  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf)
}

function ensurePdfjsPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    }
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width
        this.height = height
        this.data = new Uint8ClampedArray(width * height * 4)
      }
    }
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {}
  }
}

const workerPath = resolve(
  process.cwd(),
  '.output/server/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
)

let workerStat
try {
  workerStat = await stat(workerPath)
}
catch (error) {
  throw new Error(
    `Production resume parser bundle is missing the PDF.js worker required for text extraction at ${workerPath}`,
    { cause: error },
  )
}

if (!workerStat.isFile() || workerStat.size === 0) {
  throw new Error(
    `Production resume parser bundle contains an invalid PDF.js worker at ${workerPath} (observed size: ${workerStat.size} bytes)`,
  )
}

const bundledParserPath = resolve(
  process.cwd(),
  '.output/server/node_modules/pdf-parse/dist/pdf-parse/esm/index.js',
)

let parser
try {
  ensurePdfjsPolyfills()
  const { PDFParse } = await import(pathToFileURL(bundledParserPath).href)
  parser = new PDFParse({ data: createSmokeTestPdf() })
  const result = await parser.getText()

  if (!result.text.includes(smokeTestText)) {
    throw new Error('Bundled parser returned no usable text')
  }
}
catch (error) {
  throw new Error(
    'Production resume parser bundle failed its text extraction smoke test',
    { cause: error },
  )
}
finally {
  await parser?.destroy()
}

console.info(
  `Resume parser bundle verified (${workerStat.size} byte PDF.js worker; text extraction smoke test passed)`,
)
