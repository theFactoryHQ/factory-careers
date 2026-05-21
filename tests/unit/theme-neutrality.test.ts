import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('brand-neutral theme variables', () => {
  it('uses neutral CSS custom properties for shared app chrome', () => {
    const css = readProjectFile('app/assets/css/main.css')

    for (const token of [
      '--ui-bg',
      '--ui-panel',
      '--ui-panel-strong',
      '--ui-border',
      '--ui-border-strong',
      '--ui-text',
      '--ui-muted',
      '--ui-faint',
    ]) {
      expect(css).toContain(token)
    }

    expect(css).not.toMatch(/--factory-(bg|panel|panel-strong|border|border-strong|text|muted|faint)\b/)
  })
})
