import type { Ref } from 'vue'
import type { ApplicationStatus } from '~~/shared/application-status'
import type { JobPipelineApplication } from '~~/shared/job-pipeline'

export type PipelineRemovalSelection = {
  removedIndex: number
  preferredNeighborId: string | null
  preferSameIndex: boolean
}

/** Capture identity before a status mutation so reactive list replacement cannot reset it. */
export function capturePipelineRemovalSelection(
  applications: JobPipelineApplication[],
  applicationId: string,
  context: { total: number, hasMore: boolean },
): PipelineRemovalSelection {
  const removedIndex = applications.findIndex(application => application.id === applicationId)
  const preferSameIndex = removedIndex === applications.length - 1
    && (context.hasMore || context.total > applications.length)
  return {
    removedIndex,
    preferSameIndex,
    preferredNeighborId: removedIndex < 0
      ? null
      : applications[removedIndex + 1]?.id ?? applications[removedIndex - 1]?.id ?? null,
  }
}

/** Restore the captured neighbor, falling back to the same bounded position after refresh. */
export function restorePipelineSelectionAfterRemoval(
  applications: JobPipelineApplication[],
  selection: PipelineRemovalSelection,
): string | null {
  if (selection.preferSameIndex && applications[selection.removedIndex]) {
    return applications[selection.removedIndex]!.id
  }
  if (selection.preferredNeighborId && applications.some(application =>
    application.id === selection.preferredNeighborId,
  )) return selection.preferredNeighborId
  if (applications.length === 0) return null
  const fallbackIndex = Math.min(Math.max(selection.removedIndex, 0), applications.length - 1)
  return applications[fallbackIndex]?.id ?? null
}

/** Change stages, let reactive watchers start, then await an authoritative target-stage page. */
export async function followApplicationInPipelineStage(options: {
  applicationId: string
  targetStage: ApplicationStatus
  stage: Ref<ApplicationStatus>
  applications: Readonly<Ref<JobPipelineApplication[]>>
  selectedApplicationId: Ref<string | null>
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  hasMore: Readonly<Ref<boolean>>
  flushStageWatchers: () => Promise<unknown>
}): Promise<boolean> {
  options.stage.value = options.targetStage
  await options.flushStageWatchers()
  await options.refresh()
  let found = options.applications.value.some(application => application.id === options.applicationId)
  while (!found && options.hasMore.value) {
    const previousLength = options.applications.value.length
    await options.loadMore()
    found = options.applications.value.some(application => application.id === options.applicationId)
    if (!found && options.applications.value.length <= previousLength) break
  }
  if (!found) return false
  options.selectedApplicationId.value = options.applicationId
  return true
}
