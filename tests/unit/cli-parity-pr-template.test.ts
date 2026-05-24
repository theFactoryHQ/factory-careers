import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CLI parity pull request checklist', () => {
  it('reminds authors to update CLI parity when ATS workflows change', () => {
    const template = readFileSync(join(process.cwd(), '.github/pull_request_template.md'), 'utf8')

    expect(template).toContain('CLI parity')
    expect(template).toContain('packages/careers-cli/src/routeCoverage.ts')
    expect(template).toContain('docs/CLI.md')
    expect(template).toContain('payload shapes, response shapes, auth requirements, or resource coverage')
  })
})
