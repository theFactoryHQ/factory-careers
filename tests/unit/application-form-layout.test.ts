import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job application form layout', () => {
  it('orders tracking links below custom questions', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const questionsIndex = source.indexOf('Custom Questions')
    const trackingIndex = source.indexOf('Tracking Links')

    expect(questionsIndex).toBeGreaterThan(-1)
    expect(trackingIndex).toBeGreaterThan(-1)
    expect(trackingIndex).toBeGreaterThan(questionsIndex)
  })
})
