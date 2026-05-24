<script setup lang="ts">
import { ArchiveIcon, Brain, MoreHorizontal, Pencil, Settings2, Trash2, UserPlus } from 'lucide-vue-next'
import { JOB_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

const props = defineProps<{
  jobId: string
}>()

const toast = useToast()
const { track } = useTrack()
const localePath = useLocalePath()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

const { job, updateJob, deleteJob, refresh: refreshJob } = useJob(props.jobId)

// ─────────────────────────────────────────────
// Job status transitions
// ─────────────────────────────────────────────

const jobTransitionLabels: Record<string, string> = {
  draft: 'Revert to Draft',
  open: 'Publish',
  closed: 'Close',
  archived: 'Archive',
}

const jobTransitionTooltips: Record<string, string> = {
  draft: 'Move this job back to draft so it is no longer published.',
  open: 'Publish this job so candidates can apply.',
  closed: 'Close this job so new candidates can no longer apply.',
  archived: 'Archive this job and remove it from active hiring workflows.',
}

const jobTransitionClasses: Record<string, string> = {
  open: 'factory-job-status-action-open',
  closed: 'factory-job-status-action-closed',
  draft: 'factory-job-status-action-secondary',
  archived: 'factory-job-status-action-secondary',
}

const allowedJobTransitions = computed(() => {
  if (!job.value) return []
  return JOB_STATUS_TRANSITIONS[job.value.status] ?? []
})

const primaryJobTransition = computed(() => allowedJobTransitions.value[0] ?? null)
const secondaryJobTransitions = computed(() => allowedJobTransitions.value.slice(1))
const showArchiveTransition = computed(() => secondaryJobTransitions.value.includes('archived'))
const otherSecondaryJobTransitions = computed(() => secondaryJobTransitions.value.filter((transition) => transition !== 'archived'))

const isJobTransitioning = ref(false)

async function handleJobTransition(newStatus: string) {
  isJobTransitioning.value = true
  try {
    const fromStatus = job.value?.status
    await updateJob({ status: newStatus as any })
    track('job_status_changed', { job_id: props.jobId, from_status: fromStatus, to_status: newStatus })
    await refreshJob()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isJobTransitioning.value = false
  }
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

const isDeleting = ref(false)
const showDeleteConfirm = ref(false)

async function handleDelete() {
  isDeleting.value = true
  try {
    track('job_deleted', { job_id: props.jobId })
    await deleteJob()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete job', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

// ─────────────────────────────────────────────
// Add candidate modal
// ─────────────────────────────────────────────

const showApplyModal = ref(false)

function handleCandidateApplied() {
  showApplyModal.value = false
  refreshNuxtData(`pipeline-apps-${props.jobId}`)
}

// ─────────────────────────────────────────────
// Bulk AI scoring
// ─────────────────────────────────────────────

const isScoringAll = ref(false)
const scoringProgress = ref({ done: 0, total: 0 })

async function scoreAllCandidates() {
  isScoringAll.value = true
  scoringProgress.value = { done: 0, total: 0 }
  showMoreMenu.value = false
  try {
    const { applicationIds } = await $fetch(`/api/jobs/${props.jobId}/analyze-all`, {
      method: 'POST',
    })
    scoringProgress.value.total = applicationIds.length
    track('bulk_scoring_started', { job_id: props.jobId, candidate_count: applicationIds.length })
    if (applicationIds.length === 0) {
      toast.info('All candidates scored', 'Every candidate already has a score.')
      return
    }

    let failed = 0
    for (const appId of applicationIds) {
      try {
        await $fetch(`/api/applications/${appId}/analyze`, {
          method: 'POST',
        })
      } catch {
        failed++
      }
      scoringProgress.value.done++
    }
    await refreshNuxtData(`pipeline-apps-${props.jobId}`)
    if (failed === 0) {
      toast.success('Scoring complete', `${applicationIds.length} candidate${applicationIds.length === 1 ? '' : 's'} scored successfully.`)
    } else {
      toast.warning('Scoring partially complete', `${applicationIds.length - failed} scored, ${failed} failed (missing resume or criteria).`)
    }
  } catch (err: any) {
    const statusMessage = err?.data?.statusMessage ?? ''
    if (statusMessage.includes('AI provider not configured') || statusMessage.includes('No scoring criteria')) {
      toast.add({
        type: 'warning',
        title: 'Cannot score candidates',
        message: statusMessage,
        link: statusMessage.includes('AI provider')
          ? { label: 'Go to AI Settings', href: '/dashboard/settings/ai' }
          : undefined,
        duration: 8000,
      })
    } else {
      toast.error('Scoring failed', { message: statusMessage || 'An unexpected error occurred.', statusCode: err?.data?.statusCode })
    }
  } finally {
    isScoringAll.value = false
  }
}

// ─────────────────────────────────────────────
// More menu
// ─────────────────────────────────────────────

const showMoreMenu = ref(false)
const moreMenuRef = ref<HTMLElement | null>(null)
const moreMenuPos = ref({ top: 0, right: 0 })

function openMoreMenu() {
  if (moreMenuRef.value) {
    const rect = moreMenuRef.value.getBoundingClientRect()
    moreMenuPos.value = {
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    }
  }
  showMoreMenu.value = !showMoreMenu.value
}

function handleClickOutside(event: MouseEvent) {
  if (moreMenuRef.value && !moreMenuRef.value.contains(event.target as Node)) {
    showMoreMenu.value = false
  }
}

watch(showMoreMenu, (val) => {
  if (val) {
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

// ─────────────────────────────────────────────
// Property schema editor (per-job)
// ─────────────────────────────────────────────

const showPropertyEditor = ref(false)
const propertyEditorScope = ref<'org' | 'job'>('job')
function openPropertyEditor(scope: 'org' | 'job') {
  propertyEditorScope.value = scope
  showPropertyEditor.value = true
  showMoreMenu.value = false
}
</script>

<template>
  <!-- Quick actions teleported to sub-nav bar -->
  <Teleport to="#job-sub-nav-actions">
    <div class="flex items-center gap-2">
      <!-- Add Candidate -->
      <button
        type="button"
        class="factory-button-cta factory-button-cta-sm factory-toolbar-button hidden h-8 min-h-8 cursor-pointer items-center gap-1.5 border px-2.5 py-0 text-[11px] transition-all duration-150 sm:inline-flex"
        @click="showApplyModal = true"
      >
        <UserPlus class="size-3" />
        Add
      </button>

      <!-- Primary job action (e.g., Publish) -->
      <button
        v-if="primaryJobTransition"
        :disabled="isJobTransitioning"
        class="factory-button-cta factory-button-cta-sm factory-job-status-action inline-flex h-8 min-h-8 cursor-pointer items-center gap-1.5 border px-2.5 py-0 text-[11px] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        :class="jobTransitionClasses[primaryJobTransition] ?? 'factory-job-status-action-secondary'"
        :title="jobTransitionTooltips[primaryJobTransition] ?? `Change job status to ${primaryJobTransition}`"
        :aria-label="jobTransitionTooltips[primaryJobTransition] ?? `Change job status to ${primaryJobTransition}`"
        @click="handleJobTransition(primaryJobTransition)"
      >
        {{ jobTransitionLabels[primaryJobTransition] ?? primaryJobTransition }}
      </button>

      <!-- More menu -->
      <div ref="moreMenuRef">
        <button
          class="factory-job-more-button inline-flex h-8 min-h-8 w-8 cursor-pointer items-center justify-center border p-1 transition-all duration-150"
          type="button"
          title="Job actions"
          aria-label="Job actions"
          :aria-expanded="showMoreMenu"
          @click="openMoreMenu"
        >
          <MoreHorizontal class="size-3.5" />
        </button>

        <Teleport to="body">
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95 -translate-y-1"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 -translate-y-1"
          >
            <div
              v-if="showMoreMenu"
              :style="{ position: 'fixed', top: moreMenuPos.top + 'px', right: moreMenuPos.right + 'px' }"
              class="factory-job-more-menu z-[200] w-64 border border-white/12 bg-black py-1 shadow-2xl shadow-black/50 overflow-hidden origin-top-right"
            >
              <NuxtLink
                :to="localePath(`/dashboard/jobs/${jobId}/settings`)"
                class="factory-job-more-menu-item flex w-full items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors"
                @click="showMoreMenu = false"
              >
                <Pencil class="size-3.5" />
                Edit Job
              </NuxtLink>
              <button
                class="factory-job-more-menu-item flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors sm:hidden"
                @click="showApplyModal = true; showMoreMenu = false"
              >
                <UserPlus class="size-3.5" />
                Add Candidate
              </button>
              <button
                :disabled="isScoringAll"
                class="factory-job-more-menu-item flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors disabled:opacity-50"
                @click="scoreAllCandidates()"
              >
                <Brain class="size-3.5" />
                {{ isScoringAll ? `Scoring ${scoringProgress.done}/${scoringProgress.total}…` : 'Score All Candidates' }}
              </button>
              <button
                class="factory-job-more-menu-item flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors"
                @click="openPropertyEditor('job')"
              >
                <Settings2 class="size-3.5" />
                Job properties
              </button>
              <button
                class="factory-job-more-menu-item flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors"
                @click="openPropertyEditor('org')"
              >
                <Settings2 class="size-3.5" />
                Org properties
              </button>
              <button
                v-if="showArchiveTransition"
                :disabled="isJobTransitioning"
                class="factory-job-more-menu-item flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors disabled:opacity-50"
                @click="handleJobTransition('archived'); showMoreMenu = false"
              >
                <ArchiveIcon
                  class="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                Archive
              </button>
              <template v-if="otherSecondaryJobTransitions.length > 0">
                <button
                  v-for="t in otherSecondaryJobTransitions"
                  :key="t"
                  :disabled="isJobTransitioning"
                  class="factory-job-more-menu-item flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors disabled:opacity-50"
                  @click="handleJobTransition(t); showMoreMenu = false"
                >
                  {{ jobTransitionLabels[t] ?? t }}
                </button>
              </template>
              <button
                class="factory-job-more-menu-item factory-job-more-menu-danger flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm hover:bg-white/[0.05] hover:text-white transition-colors"
                @click="showDeleteConfirm = true; showMoreMenu = false"
              >
                <Trash2 class="size-3.5" />
                Delete Job
              </button>
            </div>
          </Transition>
        </Teleport>
      </div>
    </div>
  </Teleport>

  <!-- Property schema editor (per-job application properties) -->
  <PropertySchemaEditor
    :open="showPropertyEditor"
    entity-type="application"
    :job-id="propertyEditorScope === 'job' ? jobId : null"
    @close="showPropertyEditor = false"
  />

  <!-- Delete Job Confirm -->
  <Teleport to="body">
    <div
      v-if="showDeleteConfirm"
      class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
      @click.self="showDeleteConfirm = false"
    >
      <div class="ui-modal-panel relative w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">Delete Job</h3>
        <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">
          Are you sure you want to delete <strong>{{ job?.title }}</strong>? This will also delete all associated applications. This action cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <button
            :disabled="isDeleting"
            class="ui-button ui-button-secondary px-3 py-1.5 text-sm"
            @click="showDeleteConfirm = false"
          >
            Cancel
          </button>
          <button
            :disabled="isDeleting"
            class="ui-button ui-button-danger px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleDelete"
          >
            {{ isDeleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Apply Candidate Modal -->
  <ApplyCandidateModal
    v-if="showApplyModal"
    :job-id="jobId"
    @close="showApplyModal = false"
    @created="handleCandidateApplied"
  />
</template>
