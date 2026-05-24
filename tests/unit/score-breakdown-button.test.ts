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

  it('uses the AI provider logo in score run metadata', () => {
    const source = readProjectFile('app/components/ScoreBreakdown.vue')

    expect(source).toContain('<AiProviderLogo :provider="resolvedScoreData!.latestRun.provider"')
    expect(source).toContain(':title="`${resolvedScoreData!.latestRun.provider} · ${resolvedScoreData!.latestRun.model}`"')
    expect(source).not.toContain('{{ resolvedScoreData!.latestRun.provider }} · {{ resolvedScoreData!.latestRun.model }}')
  })

  it('keeps re-score actions inside the score breakdown section', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('<ScoreBreakdown')
    expect(source).not.toContain('scoreIndividualCandidate')
    expect(source).not.toContain('Score Candidate')
    expect(source).not.toContain('inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium')
  })

  it('formats the selected candidate score like the score breakdown value', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('getScoreTextClass')
    expect(source).toContain('class="inline-flex items-baseline gap-1"')
    expect(source).toContain('{{ currentSummary.score }}')
    expect(source).toContain('/ 100')
    expect(source).not.toContain('{{ currentSummary.score }} pts')
  })
})
