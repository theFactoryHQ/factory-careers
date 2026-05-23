import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job subnav actions', () => {
  it('does not render keyboard shortcut hints as subnav action controls', () => {
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(jobDetail).toContain('<JobSubNavActions :job-id="jobId" />')
    expect(jobDetail).not.toContain('Keyboard shortcut hints in sub-nav bar')
    expect(jobDetail).not.toContain('<span>candidates</span>')
    expect(jobDetail).not.toContain('<span>stages</span>')
    expect(jobDetail).not.toContain('<span>actions</span>')
  })
})
