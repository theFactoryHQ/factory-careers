import { describe, expect, it } from 'vitest'
import { H3Error } from 'h3'
import { buildDocumentStreamHeaders } from '../../server/utils/documentStreaming'
import { parsePropertyFiltersParam } from '../../server/utils/propertyFilters'

describe('document stream helpers', () => {
  it('builds attachment headers with encoded UTF-8 filename and content length', () => {
    const headers = buildDocumentStreamHeaders({
      filename: 'Doug Résumé.pdf',
      contentType: 'application/pdf',
      disposition: 'attachment',
      contentLength: 1536,
    })

    expect(headers).toMatchObject({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': '1536',
    })
    expect(headers['Content-Disposition']).toContain('attachment;')
    expect(headers['Content-Disposition']).toContain('Doug%20R%C3%A9sum%C3%A9.pdf')
  })

  it('adds preview-only frame and CSP headers for inline PDF streams', () => {
    const headers = buildDocumentStreamHeaders({
      filename: 'portfolio.pdf',
      contentType: 'application/pdf',
      disposition: 'inline',
      frameOptions: 'SAMEORIGIN',
      contentSecurityPolicy: "default-src 'none'",
    })

    expect(headers['Content-Disposition']).toContain('inline;')
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(headers['Content-Security-Policy']).toBe("default-src 'none'")
    expect(headers).not.toHaveProperty('Content-Length')
  })
})

describe('property filter helpers', () => {
  it('parses a valid propertyFilters query string', () => {
    const filters = parsePropertyFiltersParam(JSON.stringify([
      { propertyDefinitionId: 'prop_1', op: 'contains', value: 'machine' },
    ]))

    expect(filters).toEqual([
      { propertyDefinitionId: 'prop_1', op: 'contains', value: 'machine' },
    ])
  })

  it('returns an empty list when propertyFilters is omitted', () => {
    expect(parsePropertyFiltersParam(undefined)).toEqual([])
  })

  it('throws the existing 400 error shape for malformed JSON', () => {
    expect(() => parsePropertyFiltersParam('{')).toThrow(H3Error)

    try {
      parsePropertyFiltersParam('{')
    } catch (error) {
      expect((error as H3Error).statusCode).toBe(400)
      expect((error as H3Error).statusMessage).toBe('Invalid propertyFilters')
    }
  })

  it('throws the existing 400 error shape for invalid filters', () => {
    expect(() => parsePropertyFiltersParam(JSON.stringify([{ op: 'contains' }]))).toThrow(H3Error)
  })
})
