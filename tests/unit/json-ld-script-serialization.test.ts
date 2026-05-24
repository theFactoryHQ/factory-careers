import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('JSON-LD script serialization', () => {
  it('escapes characters that can break out of inline script data', () => {
    const source = readFileSync(join(process.cwd(), 'app/pages/jobs/[slug]/index.vue'), 'utf8')

    expect(source).toContain('function serializeJsonLd')
    expect(source).toContain(".replace(/</g, '\\\\u003C')")
    expect(source).toContain(".replace(/>/g, '\\\\u003E')")
    expect(source).toContain(".replace(/&/g, '\\\\u0026')")
    expect(source).toContain('innerHTML: serializeJsonLd({')
    expect(source).not.toContain('innerHTML: JSON.stringify({')
  })
})
