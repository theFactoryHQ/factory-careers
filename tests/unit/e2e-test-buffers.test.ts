import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E test buffers', () => {
  it('exports createTextPdf with embedded text content', () => {
    const source = readProjectFile('e2e/fixtures/test-buffers.ts')

    expect(source).toContain('export function createTextPdf')
    expect(source).toContain('%PDF-1.4')
    expect(source).toContain('text.replace(/[\\\\()]')
  })

  it('is adopted by candidate-documents spec', () => {
    const source = readProjectFile('e2e/critical-flows/candidate-documents.spec.ts')

    expect(source).toContain('createTextPdf')
    expect(source).toContain('../fixtures/test-buffers')
    expect(source).not.toContain('function createTextPdf(')
  })
})