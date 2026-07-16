import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nuxtConfig = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
const bundleVerifier = readFileSync(
  new URL('../../scripts/verify-resume-parser-bundle.mjs', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { scripts?: Record<string, string> }

describe('resume parser production bundle', () => {
  it('traces the PDF.js worker required for text extraction', () => {
    expect(nuxtConfig).toContain('pdfjs-dist/legacy/build/pdf.worker.mjs')
  })

  it('verifies the required worker after every production build', () => {
    expect(packageJson.scripts?.postbuild).toBe('node scripts/verify-resume-parser-bundle.mjs')
  })

  it('smoke-tests text extraction through the bundled parser', () => {
    expect(bundleVerifier).toContain("node_modules/pdf-parse/dist/pdf-parse/esm/index.js")
    expect(bundleVerifier).toContain('Factory Careers PDF parser smoke test')
    expect(bundleVerifier).toMatch(
      /const result = await parser\.getText\(\)\s+if \(!result\.text\.includes\(smokeTestText\)\) \{\s+throw new Error\('Bundled parser returned no usable text'\)/,
    )
    expect(bundleVerifier).toContain(
      "'Production resume parser bundle failed its text extraction smoke test'",
    )
    expect(bundleVerifier).toMatch(
      /finally \{\s+await parser\?\.destroy\(\)\s+\}/,
    )
  })

  it('reports the worker path and observed size in validation failures', () => {
    expect(bundleVerifier).toContain('required for text extraction at ${workerPath}')
    expect(bundleVerifier).toContain(
      'invalid PDF.js worker at ${workerPath} (observed size: ${workerStat.size} bytes)',
    )
  })
})
