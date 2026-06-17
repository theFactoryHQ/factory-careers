import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('demo runtime config security', () => {
  it('does not expose a demo passcode in public runtime config', () => {
    const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')

    expect(config).not.toContain('liveDemoPasscode')
    expect(config).not.toContain('LIVE_DEMO_SECRET')
    expect(config).not.toContain('DEMO_PASSWORD')
  })
})
