import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('InterviewScheduleSidebar tone', () => {
  it('exposes a defaultable inverse tone prop and applies drawer styling when inverse', () => {
    const sidebar = readProjectFile('app/components/InterviewScheduleSidebar.vue')
    const css = readProjectFile('app/assets/css/main.css')

    expect(sidebar).toContain("tone?: 'default' | 'inverse'")
    expect(sidebar).toContain("tone: 'default'")
    expect(sidebar).toContain('const isInverseTone = computed(() => props.tone === \'inverse\')')
    expect(sidebar).toContain('ui-interview-schedule-sidebar')
    expect(sidebar).toContain('border-white/12 bg-black text-white')
    expect(css).toContain('.ui-interview-schedule-sidebar')
    expect(css).toContain('background-color: #000000 !important')
  })

  it('passes tone="inverse" from detail drawer overlay call sites', () => {
    const candidateDrawer = readProjectFile('app/components/CandidateDetailDrawer.vue')
    const applicationDrawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')

    expect(candidateDrawer).toMatch(/<InterviewScheduleSidebar[\s\S]*?tone="inverse"/)
    expect(applicationDrawer).toMatch(/<InterviewScheduleSidebar[\s\S]*?tone="inverse"/)
  })
})