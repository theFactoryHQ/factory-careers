import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

describe('application switch isolation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('rejects delayed scoring responses that belong to a previously selected application', async () => {
    const applicationId = ref('app_A')
    const response = ref<any>({
      applicationId: 'app_A',
      compositeScore: 82,
      scoreBand: null,
      latestSuccessfulRun: { id: 'run_A', summary: 'Summary A' },
      latestAttempt: { id: 'run_A', status: 'completed' },
    })

    vi.stubGlobal('useRequestHeaders', vi.fn(() => ({})))
    vi.stubGlobal('useFetch', vi.fn(() => ({
      data: response,
      refresh: vi.fn(),
    })))

    const { useApplicationScoringData } = await import('../../app/composables/useApplicationScoringData')
    const state = useApplicationScoringData({ applicationId })

    expect(state.scoringData.value?.applicationId).toBe('app_A')
    expect(state.scoringSummary.value).toBe('Summary A')

    applicationId.value = 'app_B'
    await nextTick()
    expect(state.scoringData.value).toBeNull()
    expect(state.scoringSummary.value).toBe('')

    // A delayed response for A must remain invisible while B is selected.
    response.value = {
      ...response.value,
      applicationId: 'app_A',
      latestSuccessfulRun: { id: 'run_A_delayed', summary: 'Delayed A' },
    }
    await nextTick()
    expect(state.scoringData.value).toBeNull()

    response.value = {
      applicationId: 'app_B',
      compositeScore: 71,
      scoreBand: null,
      latestSuccessfulRun: { id: 'run_B', summary: 'Summary B' },
      latestAttempt: { id: 'run_B', status: 'completed' },
    }
    await nextTick()
    expect(state.scoringData.value?.applicationId).toBe('app_B')
    expect(state.scoringSummary.value).toBe('Summary B')
  })

  it('flushes a pending autosave with application A notes when the A drawer scope is disposed', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_notes: string | null) => undefined)

    vi.stubGlobal('usePreviewReadOnly', vi.fn(() => ({
      handlePreviewReadOnlyError: vi.fn(() => false),
    })))
    vi.stubGlobal('useToast', vi.fn(() => ({ error: vi.fn() })))

    const { useEditableApplicationNotes } = await import('../../app/composables/useEditableApplicationNotes')
    const scope = effectScope()
    const notes = scope.run(() => useEditableApplicationNotes({
      application: ref({ notes: 'Original A notes' }),
      save,
    }))!

    await notes.startEditNotes()
    notes.notesInput.value = 'Pending A notes'
    notes.autosaveNotes()

    scope.stop()
    await Promise.resolve()
    await Promise.resolve()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('Pending A notes')

    await vi.advanceTimersByTimeAsync(700)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('remounts drawer and pipeline scoring state when the selected application changes', () => {
    const applicationsPage = readFileSync(
      join(process.cwd(), 'app/pages/dashboard/applications/index.vue'),
      'utf8',
    )
    const jobPipeline = readFileSync(
      join(process.cwd(), 'app/pages/dashboard/jobs/[id]/index.vue'),
      'utf8',
    )
    const scoringPanel = readFileSync(
      join(process.cwd(), 'app/components/ApplicationScoringPanel.vue'),
      'utf8',
    )

    expect(applicationsPage).toContain(':key="selectedApplicationId"')
    expect(jobPipeline).toContain(':key="currentSummary.id"')
    expect(scoringPanel).toContain(':key="`${applicationId}:${analysisRunId ?? \'none\'}`"')
  })
})
