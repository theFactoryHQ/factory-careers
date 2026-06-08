import type { MaybeRefOrGetter } from 'vue'
import type { ApplicationStatus } from '~~/shared/application-status'

type ApplicationDetailTarget = {
  score: number | null
  job: {
    id: string
  }
  notes?: string | null
  status?: string | null
}

type UseApplicationDetailSurfaceOptions = {
  applicationId: MaybeRefOrGetter<string>
  application: MaybeRefOrGetter<ApplicationDetailTarget | null | undefined>
  source: string
  refreshApplication?: boolean
  refresh?: () => Promise<unknown> | unknown
  updateApplication: (payload: Partial<{
    status: 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'
    notes: string | null
    score: number | null
  }>) => Promise<unknown>
}

export function useApplicationDetailSurface(options: UseApplicationDetailSurfaceOptions) {
  const {
    scoringData,
    scoringSummary,
    scoringSummaryFallback,
    scoreBand,
    isScoringApplication,
    scoreCurrentApplication,
  } = useApplicationScoringPanel({
    applicationId: options.applicationId,
    application: options.application,
    source: options.source,
    refreshApplication: options.refreshApplication,
    refresh: options.refresh,
  })

  const showInterviewSidebar = ref(false)

  function openInterviewScheduler() {
    showInterviewSidebar.value = true
  }

  const { allowedTransitions, isTransitioning, transitionToStatus } = useApplicationStatusActions({
    application: options.application,
    updateStatus: status => options.updateApplication({ status: status as ApplicationStatus }),
  })

  const {
    isEditingNotes,
    notesInput,
    isSavingNotes,
    notesSaveStatus,
    startEditNotes,
    saveNotes,
    autosaveNotes,
    finishEditNotes,
  } = useEditableApplicationNotes({
    application: options.application,
    focusOnEdit: true,
    save: notes => options.updateApplication({ notes }),
  })

  return {
    scoringData,
    scoringSummary,
    scoringSummaryFallback,
    scoreBand,
    isScoringApplication,
    scoreCurrentApplication,
    showInterviewSidebar,
    openInterviewScheduler,
    allowedTransitions,
    isTransitioning,
    transitionToStatus,
    isEditingNotes,
    notesInput,
    isSavingNotes,
    notesSaveStatus,
    startEditNotes,
    saveNotes,
    autosaveNotes,
    finishEditNotes,
  }
}