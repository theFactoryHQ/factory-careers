import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { escapeMarkdownTableValue } = await import('../../server/api/feedback.post')

describe('feedback Markdown table escaping', () => {
  it('escapes backslashes before escaping Markdown table pipes', () => {
    expect(escapeMarkdownTableValue(String.raw`Alice \| Recruiting`)).toBe(String.raw`Alice \\\| Recruiting`)
  })
})
