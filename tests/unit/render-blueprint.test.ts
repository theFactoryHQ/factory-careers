import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Render blueprint', () => {
  const source = readFileSync(join(process.cwd(), 'render.yaml'), 'utf8')

  it('keeps production Microsoft Calendar in app-only mode', () => {
    expect(source).toContain('key: MICROSOFT_CALENDAR_AUTH_MODE')
    expect(source).toContain('value: application')
  })
})
