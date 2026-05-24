import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('score breakdown actions', () => {
  it('renders the AI summary from the latest scoring run', () => {
    const source = readProjectFile('app/components/ScoreBreakdown.vue')

    expect(source).toContain('const scoringSummary = computed')
    expect(source).toContain('AI summary')
    expect(source).toContain('{{ scoringSummary }}')
    expect(source).toContain('No AI summary was stored for this score. Re-score to generate one.')
  })

  it('uses the shared Factory button recipe for the re-score action', () => {
    const source = readProjectFile('app/components/ScoreBreakdown.vue')

    expect(source).toContain('factory-button-cta factory-button-premium')
    expect(source).not.toContain('text-xs text-brand-600 dark:text-brand-400 hover:underline')
  })

  it('uses the shared Factory button recipe for the selected candidate score action', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toMatch(/currentSummary\.score != null[\s\S]*factory-button-cta factory-button-premium/)
    expect(source).not.toContain('inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium')
  })
})
