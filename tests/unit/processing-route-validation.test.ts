import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('processing route validation', () => {
  it('does not reinterpret malformed drain request bodies as an empty object', () => {
    const source = readFileSync(join(
      process.cwd(),
      'server/api/processing/[id]/drain.post.ts',
    ), 'utf8')

    expect(source).toContain('.strict()')
    expect(source).not.toContain('readBody(event).catch')
  })
})
