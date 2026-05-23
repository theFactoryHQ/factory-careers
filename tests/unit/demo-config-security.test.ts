import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('demo runtime config security', () => {
  it('does not expose demo1234 as the public live demo passcode fallback', () => {
    const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    const liveDemoPasscodeBlock = config.match(/liveDemoPasscode:[\s\S]*?\/\*\*/)?.[0] ?? ''

    expect(liveDemoPasscodeBlock).not.toContain('demo1234')
  })
})
