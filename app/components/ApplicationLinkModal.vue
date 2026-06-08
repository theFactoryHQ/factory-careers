<script setup lang="ts">
import { Briefcase, MapPin, UserPlus, X } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = withDefaults(defineProps<{
  mode: 'job' | 'candidate'
  candidateId?: string
  jobId?: string
  teleportTo?: string | HTMLElement
  /** Modal stacking layer. Defaults to z-[90] in job mode (above drawer overlays) and z-50 in candidate mode. */
  zIndexClass?: string
}>(), {
  teleportTo: 'body',
  zIndexClass: undefined,
})

const emit = defineEmits<{
  close: []
  created: []
}>()

const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { formatCandidateName } = useOrgSettings()
const toast = useToast()

const resolvedZIndexClass = computed(() => props.zIndexClass ?? (props.mode === 'job' ? 'z-[90]' : 'z-50'))

const modalAriaLabel = computed(() => props.mode === 'job' ? 'Apply to job' : 'Add candidate')

if (import.meta.dev) {
  if (props.mode === 'job' && !props.candidateId) {
    throw new Error('ApplicationLinkModal requires candidateId when mode is "job".')
  }
  if (props.mode === 'candidate' && !props.jobId) {
    throw new Error('ApplicationLinkModal requires jobId when mode is "candidate".')
  }
}

// ─── Job mode: list open roles for a candidate ────────────────────────────────

const { jobs, fetchStatus: jobFetchStatus } = useJobs({
  status: 'open',
  immediate: props.mode === 'job',
})

// ─── Candidate mode: search candidates for a job ──────────────────────────────

const searchInput = ref('')
const debouncedSearch = useDebouncedRef(searchInput, {
  transform: value => value.trim() || undefined,
  initial: undefined as string | undefined,
})

const { data: candidateData, status: searchStatus } = useFetch('/api/candidates', {
  key: 'application-link-candidate-search',
  query: computed(() => ({
    ...(debouncedSearch.value && { search: debouncedSearch.value }),
    limit: 20,
  })),
  headers: useRequestHeaders(['cookie']),
  immediate: props.mode === 'candidate',
})

const candidates = computed(() => candidateData.value?.data ?? [])

// ─── Create application ───────────────────────────────────────────────────────

const isApplying = ref(false)

async function createApplication(payload: { candidateId: string, jobId: string }) {
  isApplying.value = true
  try {
    await $fetch('/api/applications', {
      method: 'POST',
      body: payload,
    })
    emit('created')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    const message = props.mode === 'job' ? 'Failed to apply to job' : 'Failed to apply candidate'
    toast.error(message, { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isApplying.value = false
  }
}

function applyToJob(jobId: string) {
  if (!props.candidateId) {
    if (import.meta.dev) {
      throw new Error('ApplicationLinkModal requires candidateId when mode is "job".')
    }
    return
  }
  return createApplication({ candidateId: props.candidateId, jobId })
}

function applyCandidate(candidateId: string) {
  if (!props.jobId) {
    if (import.meta.dev) {
      throw new Error('ApplicationLinkModal requires jobId when mode is "candidate".')
    }
    return
  }
  return createApplication({ candidateId, jobId: props.jobId })
}
</script>

<template>
  <AppModalShell
    :teleport-to="teleportTo"
    :z-index-class="resolvedZIndexClass"
    :aria-label="modalAriaLabel"
    @close="emit('close')"
  >
    <AppModalPanel class="flex w-full max-w-lg flex-col overflow-hidden border border-white/12 bg-black text-white shadow-2xl shadow-black/70">
      <header class="ui-panel-header flex items-center justify-between gap-4 px-5 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center border border-brand-500/45 bg-brand-500/12 text-brand-300">
            <Briefcase v-if="mode === 'job'" class="size-4" />
            <UserPlus v-else class="size-4" />
          </div>
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-white">
              {{ mode === 'job' ? 'Apply to job' : 'Add candidate' }}
            </h2>
            <p v-if="mode === 'job'" class="mt-0.5 text-xs text-white/42">
              Choose an open role for this candidate.
            </p>
            <p v-else class="mt-0.5 text-xs text-white/42">
              Search and link an existing candidate to this job.
            </p>
          </div>
        </div>
        <button
          type="button"
          class="ui-button ui-button-ghost ui-panel-close-button shrink-0 p-1.5"
          :aria-label="mode === 'job' ? 'Close apply to job modal' : 'Close add candidate modal'"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
      </header>

      <div v-if="mode === 'candidate'" class="px-5 pt-4">
        <GooeySearchInput
          v-model="searchInput"
          aria-label="Search candidates"
          class="w-full"
          placeholder="Search candidates by name or email…"
          reserve-expanded-space
          tone="inverse"
        />
      </div>

      <div class="max-h-[60vh] overflow-y-auto p-5">
        <template v-if="mode === 'job'">
          <div v-if="jobFetchStatus === 'pending'" class="ui-empty-state border border-white/12 bg-white/[0.025] px-4 py-8 text-center text-sm text-white/54">
            Loading jobs…
          </div>

          <div v-else-if="jobs.length === 0" class="ui-empty-state border border-white/12 bg-white/[0.025] px-4 py-8 text-center text-sm text-white/54">
            No open jobs available.
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="job in jobs"
              :key="job.id"
              :disabled="isApplying"
              class="group flex w-full cursor-pointer items-center justify-between gap-4 border border-white/12 bg-white/[0.025] px-4 py-3 text-left transition-colors hover:border-brand-500/70 hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              @click="applyToJob(job.id)"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-300">
                  {{ job.title }}
                </p>
                <p v-if="job.location" class="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-white/42">
                  <MapPin class="size-3 shrink-0" />
                  {{ job.location }}
                </p>
              </div>
              <span class="factory-button-cta factory-button-cta-sm inline-flex h-8 shrink-0 items-center border border-brand-500 bg-brand-600 px-3 text-[10px] font-semibold uppercase tracking-normal text-white transition-colors group-hover:bg-brand-500">
                Apply
              </span>
            </button>
          </div>
        </template>

        <template v-else>
          <div v-if="searchStatus === 'pending'" class="ui-empty-state border border-white/12 bg-white/[0.025] px-4 py-8 text-center text-sm text-white/54">
            Searching…
          </div>

          <div v-else-if="candidates.length === 0" class="ui-empty-state border border-white/12 bg-white/[0.025] px-4 py-8 text-center text-sm text-white/54">
            {{ debouncedSearch ? 'No candidates found.' : 'No candidates in your org yet.' }}
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="candidate in candidates"
              :key="candidate.id"
              :disabled="isApplying"
              class="group flex w-full cursor-pointer items-center justify-between gap-4 border border-white/12 bg-white/[0.025] px-4 py-3 text-left transition-colors hover:border-brand-500/70 hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              @click="applyCandidate(candidate.id)"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-300">
                  {{ formatCandidateName(candidate) }}
                </p>
                <p class="mt-1 truncate text-xs text-white/42">{{ candidate.email }}</p>
              </div>
              <span class="factory-button-cta factory-button-cta-sm inline-flex h-8 shrink-0 items-center border border-brand-500 bg-brand-600 px-3 text-[10px] font-semibold uppercase tracking-normal text-white transition-colors group-hover:bg-brand-500">
                Apply
              </span>
            </button>
          </div>
        </template>
      </div>
    </AppModalPanel>
  </AppModalShell>
</template>