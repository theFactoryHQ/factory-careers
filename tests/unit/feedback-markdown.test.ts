import { afterAll, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const cleanupTimer = { unref: vi.fn() }
const setIntervalMock = vi.fn(() => cleanupTimer)

vi.stubGlobal('setInterval', setIntervalMock)

const { escapeMarkdownTableValue } = await import('../../server/api/feedback.post')

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('feedback Markdown table escaping', () => {
  it('stubs the feedback cleanup timer during route helper import', () => {
    expect(setIntervalMock).toHaveBeenCalledOnce()
    expect(cleanupTimer.unref).toHaveBeenCalledOnce()
  })

  it('escapes backslashes before escaping Markdown table pipes', () => {
    expect(escapeMarkdownTableValue(String.raw`Alice \| Recruiting`)).toBe(String.raw`Alice \\\| Recruiting`)
  })
})
