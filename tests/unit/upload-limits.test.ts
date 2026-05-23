import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertUploadContentLength } from '../../server/utils/uploadLimits'

function makeError(opts: { statusCode: number; statusMessage?: string }) {
  return Object.assign(new Error(opts.statusMessage), opts)
}

function makeEvent(contentLength?: string) {
  return {
    __headers: contentLength ? { 'content-length': contentLength } : {},
  }
}

describe('upload content-length guard', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', makeError)
    vi.stubGlobal('getHeader', (event: ReturnType<typeof makeEvent>, name: string) => {
      return event.__headers[name.toLowerCase()]
    })
  })

  it('rejects oversized request bodies before multipart buffering', () => {
    expect(() => assertUploadContentLength(makeEvent('10485761') as any, 10 * 1024 * 1024))
      .toThrow(expect.objectContaining({ statusCode: 413 }))
  })

  it('allows request bodies at the configured limit', () => {
    expect(() => assertUploadContentLength(makeEvent('10485760') as any, 10 * 1024 * 1024))
      .not.toThrow()
  })

  it('ignores missing content-length so chunked uploads still reach per-file validation', () => {
    expect(() => assertUploadContentLength(makeEvent() as any, 10 * 1024 * 1024))
      .not.toThrow()
  })

  it('rejects malformed content-length values', () => {
    expect(() => assertUploadContentLength(makeEvent('abc') as any, 10 * 1024 * 1024))
      .toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
