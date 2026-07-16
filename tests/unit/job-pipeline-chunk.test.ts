import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job pipeline lazy panels', () => {
  it('registers async panel loaders for timeline, scoring, documents, and responses', () => {
    const source = readProjectFile('app/utils/job-pipeline-lazy-panels.ts')

    expect(source).toContain('defineAsyncComponent')
    expect(source).toContain('JobPipelineTimelinePanel.vue')
    expect(source).toContain('JobPipelineAiScorePanel.vue')
    expect(source).toContain('JobPipelineDocumentsPanel.vue')
    expect(source).toContain('JobPipelineResponsesPanel.vue')
  })

  it('wires lazy panels, idle overview deferral, and deferred interviews on the pipeline page', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('jobPipelineLazyPanels')
    expect(source).toContain('JobPipelineAiScorePanel')
    expect(source).toContain('JobPipelineDocumentsPanel')
    expect(source).toContain('JobPipelineResponsesPanel')
    expect(source).toContain('JobPipelineTimelinePanel')
    expect(source).toContain('overviewHeavyReady')
    expect(source).toContain('requestIdleCallback')
    expect(source).toContain('executeJobInterviewsFetch')
    expect(source).toContain('immediate: false')
    expect(source).not.toContain('<ScoreBreakdown')
    expect(source).not.toContain('loadTimeline(')
    expect(source).not.toContain('timelineItems')
  })

  it('keeps core pipeline data composables on the route page', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(source).toContain('useJob(jobId)')
    expect(source).toContain('useApplications({ jobId, limit: 100, search: debouncedApplicationSearch, allPages: true })')
    expect(source).toContain('pipeline-application-${currentApplicationId.value}')
    expect(source).toContain('cachedApplication')
  })
})
