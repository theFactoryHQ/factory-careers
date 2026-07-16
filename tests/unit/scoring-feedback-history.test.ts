import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('scoring feedback and history', () => {
  it('stores immutable per-run criterion scores separately from latest scores', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const analyzeRoute = readProjectFile('server/api/applications/[id]/analyze.post.ts')
    const autoScore = readProjectFile('server/utils/ai/autoScore.ts')
    const analyzeApplication = readProjectFile('server/utils/analyzeApplication.ts')
    const migration = readProjectFile('server/database/migrations/0044_scoring_feedback_history.sql')

    expect(schema).toContain('export const analysisRunCriterionScore = pgTable')
    expect(schema).toContain("analysisRunId: text('analysis_run_id').notNull().references(() => analysisRun.id")
    expect(schema).toContain('analysisRunCriterionScoreRelations')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "analysis_run_criterion_score"')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "analysis_run_criterion_score_run_idx"')

    expect(analyzeApplication).toContain('analysisRunCriterionScore')
    expect(analyzeApplication).toContain('analysisRunId: run.id')
    expect(analyzeApplication).toContain('await tx.insert(analysisRunCriterionScore).values')
    expect(analyzeRoute).toContain('analyzeApplication({')
    expect(autoScore).toContain('analyzeApplication({')
  })

  it('persists admin sentiment and comments against the application current scoring run', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const scoringSchemas = readProjectFile('server/utils/schemas/scoring.ts')
    const route = readProjectFile('server/api/applications/[id]/scoring-feedback.post.ts')
    const migration = readProjectFile('server/database/migrations/0044_scoring_feedback_history.sql')

    expect(schema).toContain("export const scoringFeedbackSentimentEnum = pgEnum('scoring_feedback_sentiment'")
    expect(schema).toContain('export const analysisRunFeedback = pgTable')
    expect(schema).toContain("sentiment: scoringFeedbackSentimentEnum('sentiment').notNull()")
    expect(schema).toContain("comment: text('comment')")
    expect(migration).toContain('CREATE TYPE "scoring_feedback_sentiment" AS ENUM')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "analysis_run_feedback"')

    expect(scoringSchemas).toContain('export const createScoringFeedbackSchema')
    expect(scoringSchemas).toContain("z.enum(['up', 'down'])")
    expect(route).toContain("requirePermission(event, { scoring: ['update'] })")
    expect(route).toContain('createScoringFeedbackSchema.parse')
    expect(route).toContain('analysisRunFeedback')
    expect(route).toContain('analysisRunId: app.currentAnalysisRunId')
  })

  it('renders the scoring feedback control next to scoring actions on both application detail surfaces', () => {
    const component = readProjectFile('app/components/ScoringFeedbackControl.vue')
    const scoringPanel = readProjectFile('app/components/ApplicationScoringPanel.vue')
    const drawer = readProjectFile('app/components/ApplicationDetailDrawer.vue')
    const fullPage = readProjectFile('app/pages/dashboard/applications/[id].vue')

    expect(component).toContain('ThumbsUp')
    expect(component).toContain('ThumbsDown')
    expect(component).toContain('v-if="isFeedbackOpen"')
    expect(component).toContain("submitFeedback('down')")
    expect(component).toContain("submitFeedback('up')")
    expect(component).toContain('$fetch(`/api/applications/${props.applicationId}/scoring-feedback`')

    expect(scoringPanel).toContain('<ScoringFeedbackControl')
    expect(scoringPanel).toContain(':application-id="applicationId"')
    expect(scoringPanel).toContain(':analysis-run-id="analysisRunId"')

    for (const source of [drawer, fullPage]) {
      expect(source).toContain('<ApplicationScoringPanel')
      expect(source).toContain(':application-id="applicationId"')
      expect(source).toContain(':analysis-run-id="scoringData?.latestSuccessfulRun?.id ?? null"')
    }
  })
})
