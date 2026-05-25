import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job pipeline layout', () => {
  it('does not cap the selected application detail pane', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const detailStart = source.indexOf('<!-- Sticky status transitions')
    const detailEnd = source.indexOf('class="factory-mobile-candidate-bar')
    const detailPane = source.slice(detailStart, detailEnd)

    expect(detailStart).toBeGreaterThan(-1)
    expect(detailEnd).toBeGreaterThan(detailStart)
    expect(detailPane).not.toContain('max-w-4xl')
    expect(detailPane).toContain('factory-application-transition-strip flex w-full')
    expect(detailPane).toContain('factory-candidate-header-inner flex w-full')
    expect(detailPane).toContain('factory-candidate-detail-tabs grid h-8 w-full')
  })
})
