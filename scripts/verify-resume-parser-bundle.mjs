import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

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
    'Production resume parser bundle is missing the PDF.js worker required for text extraction',
    { cause: error },
  )
}

if (!workerStat.isFile() || workerStat.size === 0) {
  throw new Error(
    'Production resume parser bundle contains an invalid PDF.js worker',
  )
}

console.info(`Resume parser bundle verified (${workerStat.size} byte PDF.js worker)`)
