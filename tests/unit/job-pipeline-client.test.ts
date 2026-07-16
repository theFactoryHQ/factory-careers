import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('job pipeline client', () => {
  it('uses a bounded pipeline composable with stale-response fencing and incremental loading', () => {
    const page = read('app/pages/dashboard/jobs/[id]/index.vue')
    const composable = read('app/composables/useJobPipeline.ts')

    expect(page).toContain('useJobPipeline({')
    expect(page).not.toContain('allPages: true')
    expect(page).toContain('selectedApplicationId')
    expect(page).toContain('@click="loadMore"')
    expect(page).toContain('applicationTotal')
    expect(composable).toContain('AbortController')
    expect(composable).toContain('requestGeneration')
    expect(composable).toContain('jobPipelineRequestFingerprint')
    expect(composable).toContain('mergeJobPipelinePages')
    expect(composable).toContain('useState<JobPipelineResponse | null>')
    expect(composable).toContain('loadedFingerprint')
    expect(composable).toContain('stateFingerprint')
    expect(composable).toContain('appendError')
    expect(page).toContain('limit: 25')
    expect(page).toContain('Retry loading more candidates')
    expect(page).toContain('role="alert"')
    expect(page).toContain('followApplicationInPipelineStage({')
    expect(page).toContain('capturePipelineRemovalSelection(')
    expect(page).toContain('restorePipelineSelectionAfterRemoval(')
  })

  it('limits pipeline keyboard shortcuts to focus inside the pipeline surface', () => {
    const page = read('app/pages/dashboard/jobs/[id]/index.vue')

    expect(page).toContain("pipelineContainer.value?.contains(document.activeElement)")
    expect(page).toContain("event.key === 'Escape' && showDocPreview.value")
    expect(page).toContain("event.key === 'Escape' && isFullscreen.value")
  })
})
