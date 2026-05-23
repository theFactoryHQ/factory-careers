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

  it('uses the applications toolbar button recipe for the pipeline fullscreen control', () => {
    const applications = readProjectFile('app/pages/dashboard/applications/index.vue')
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(applications).toContain('factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors')
    expect(jobDetail).toContain('factory-toolbar-button ml-auto inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors')
    expect(jobDetail).toContain(":title=\"isFullscreen ? 'Exit fullscreen' : 'Fullscreen pipeline'\"")
    expect(jobDetail).toContain(":aria-label=\"isFullscreen ? 'Exit fullscreen' : 'Fullscreen pipeline'\"")
  })
})
