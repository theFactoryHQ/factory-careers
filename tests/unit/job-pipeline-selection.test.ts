import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { JobPipelineApplication } from '../../shared/job-pipeline'
import {
  capturePipelineRemovalSelection,
  followApplicationInPipelineStage,
  restorePipelineSelectionAfterRemoval,
} from '../../app/utils/job-pipeline-selection'

function application(id: string): JobPipelineApplication {
  return {
    id,
    status: 'new',
    score: null,
    candidateId: `candidate_${id}`,
    candidateFirstName: id,
    candidateLastName: 'Candidate',
    candidateEmail: `${id}@example.com`,
    hasScheduledInterview: false,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
    properties: [],
  }
}

describe('job pipeline selection', () => {
  it('restores the next neighbor, or the previous neighbor when removing the last row', () => {
    const rows = ['app_a', 'app_b', 'app_c'].map(application)

    const middle = capturePipelineRemovalSelection(rows, 'app_b', { total: 3, hasMore: false })
    expect(restorePipelineSelectionAfterRemoval([rows[0]!, rows[2]!], middle)).toBe('app_c')

    const last = capturePipelineRemovalSelection(rows, 'app_c', { total: 3, hasMore: false })
    expect(restorePipelineSelectionAfterRemoval([rows[0]!, rows[1]!], last)).toBe('app_b')
  })

  it('selects the server row pulled into the same index when the last loaded row is removed', () => {
    const loaded = ['app_a', 'app_b', 'app_c'].map(application)
    const selection = capturePipelineRemovalSelection(loaded, 'app_c', { total: 5, hasMore: true })
    const refreshed = ['app_a', 'app_b', 'app_d'].map(application)

    expect(restorePipelineSelectionAfterRemoval(refreshed, selection)).toBe('app_d')
  })

  it('awaits the target-stage refresh before selecting the scheduled application by ID', async () => {
    const stage = ref<'new' | 'interview'>('new')
    const rows = ref<JobPipelineApplication[]>([application('app_old')])
    const selectedApplicationId = ref<string | null>('app_old')
    const calls: string[] = []
    const refresh = vi.fn(async () => {
      calls.push(`refresh:${stage.value}`)
      rows.value = [application('app_target')]
    })

    await followApplicationInPipelineStage({
      applicationId: 'app_target',
      targetStage: 'interview',
      stage,
      applications: rows,
      selectedApplicationId,
      refresh,
      loadMore: vi.fn(async () => {}),
      hasMore: ref(false),
      flushStageWatchers: async () => calls.push(`flush:${stage.value}`),
    })

    expect(calls).toEqual(['flush:interview', 'refresh:interview'])
    expect(selectedApplicationId.value).toBe('app_target')
  })

  it('loads bounded follow-on pages until the scheduled application is found', async () => {
    const stage = ref<'new' | 'interview'>('new')
    const rows = ref<JobPipelineApplication[]>([])
    const selectedApplicationId = ref<string | null>(null)
    const hasMore = ref(true)
    const refresh = vi.fn(async () => {
      rows.value = [application('app_page_1')]
    })
    const loadMore = vi.fn()
      .mockImplementationOnce(async () => {
        rows.value = [...rows.value, application('app_page_2')]
      })
      .mockImplementationOnce(async () => {
        rows.value = [...rows.value, application('app_target')]
        hasMore.value = false
      })

    await expect(followApplicationInPipelineStage({
      applicationId: 'app_target',
      targetStage: 'interview',
      stage,
      applications: rows,
      selectedApplicationId,
      refresh,
      loadMore,
      hasMore,
      flushStageWatchers: async () => {},
    })).resolves.toBe(true)

    expect(loadMore).toHaveBeenCalledTimes(2)
    expect(selectedApplicationId.value).toBe('app_target')
  })
})
