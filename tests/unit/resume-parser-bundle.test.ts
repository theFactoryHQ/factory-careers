import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nuxtConfig = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { scripts?: Record<string, string> }

describe('resume parser production bundle', () => {
  it('traces the PDF.js worker required for text extraction', () => {
    expect(nuxtConfig).toContain('"pdfjs-dist/legacy/build/pdf.worker.mjs"')
  })

  it('verifies the required worker after every production build', () => {
    expect(packageJson.scripts?.postbuild).toBe('node scripts/verify-resume-parser-bundle.mjs')
  })
})
