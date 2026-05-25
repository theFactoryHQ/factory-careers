<script setup lang="ts">
import { Briefcase, MapPin, X } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = defineProps<{
  candidateId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created'): void
}>()

// Fetch open jobs
const { data: jobData, status: jobFetchStatus } = useFetch('/api/jobs', {
  key: 'apply-to-job-list',
  query: { status: 'open' },
  headers: useRequestHeaders(['cookie']),
})

const jobs = computed(() => jobData.value?.data ?? [])
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

// Apply to job
const isApplying = ref(false)

async function applyToJob(jobId: string) {
  isApplying.value = true
  try {
    await $fetch('/api/applications', {
      method: 'POST',
      body: { candidateId: props.candidateId, jobId },
    })
    emit('created')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to apply to job', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isApplying.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[90] grid place-items-center p-4"
      @click.self="emit('close')"
    >
      <div class="ui-modal-panel flex w-full max-w-lg flex-col overflow-hidden border border-white/12 bg-black text-white shadow-2xl shadow-black/70">
        <!-- Header -->
        <div class="flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center border border-brand-500/45 bg-brand-500/12 text-brand-300">
              <Briefcase class="size-4" />
            </div>
            <div class="min-w-0">
              <h3 class="text-base font-semibold text-white">Apply to Job</h3>
              <p class="mt-0.5 text-xs text-white/42">Choose an open role for this candidate.</p>
            </div>
          </div>
          <button
            class="ui-panel-close-button inline-flex size-9 shrink-0 cursor-pointer items-center justify-center border border-transparent bg-transparent text-white/58 transition-colors hover:border-white hover:bg-white hover:text-black"
            aria-label="Close"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Job list -->
        <div class="max-h-[60vh] overflow-y-auto p-5">
          <div v-if="jobFetchStatus === 'pending'" class="ui-empty-state border border-white/12 bg-white/[0.025] px-4 py-8 text-center text-sm text-white/54">
            Loading jobs…
          </div>

          <div v-else-if="jobs.length === 0" class="ui-empty-state border border-white/12 bg-white/[0.025] px-4 py-8 text-center text-sm text-white/54">
            No open jobs available.
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="j in jobs"
              :key="j.id"
              :disabled="isApplying"
              class="group flex w-full cursor-pointer items-center justify-between gap-4 border border-white/12 bg-white/[0.025] px-4 py-3 text-left transition-colors hover:border-brand-500/70 hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              @click="applyToJob(j.id)"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white transition-colors group-hover:text-brand-300">
                  {{ j.title }}
                </p>
                <p v-if="j.location" class="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-white/42">
                  <MapPin class="size-3 shrink-0" />
                  {{ j.location }}
                </p>
              </div>
              <span class="factory-button-cta factory-button-cta-sm inline-flex h-8 shrink-0 items-center border border-brand-500 bg-brand-600 px-3 text-[10px] font-semibold uppercase tracking-normal text-white transition-colors group-hover:bg-brand-500">
                Apply
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
