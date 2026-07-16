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

    expect(source).toContain('<AiProviderLogo :provider="latestSuccessfulRun.provider"')
    expect(source).toContain(':title="`${latestSuccessfulRun.provider} · ${latestSuccessfulRun.model}`"')
    expect(source).not.toContain('{{ latestSuccessfulRun.provider }} · {{ latestSuccessfulRun.model }}')
  })

  it('formats score run timestamps like application timestamps', () => {
    const source = readProjectFile('app/components/ScoreBreakdown.vue')

    expect(source).toContain('function formatScoreRunDate')
    expect(source).toContain('factory-application-timestamp-link ml-auto')
    expect(source).toContain('<span class="factory-application-timestamp-label">Updated</span>')
    expect(source).toContain('{{ formatScoreRunDate(latestSuccessfulRun.createdAt) }}')
    expect(source).not.toContain('new Date(latestSuccessfulRun.createdAt).toLocaleString()')
  })

  it('keeps re-score actions inside the lazy-loaded score breakdown panel', () => {
    const pipelinePage = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const scorePanel = readProjectFile('app/components/job-pipeline/JobPipelineAiScorePanel.vue')

    expect(pipelinePage).toContain('<JobPipelineAiScorePanel')
    expect(scorePanel).toContain('<ScoreBreakdown')
    expect(pipelinePage).not.toContain('scoreIndividualCandidate')
    expect(pipelinePage).not.toContain('Score Candidate')
    expect(pipelinePage).not.toContain('inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium')
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
