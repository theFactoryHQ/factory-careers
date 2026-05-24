<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const toast = useToast()
const { track } = useTrack()

const { job, status: fetchStatus, error: fetchError, deleteJob } = useJob(jobId)

useSeoMeta({
  title: computed(() =>
    job.value ? `Settings — ${job.value.title} — Factory Careers` : 'Job Settings — Factory Careers',
  ),
})

const showDeleteConfirm = ref(false)
const isDeleting = ref(false)
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

async function handleDelete() {
  isDeleting.value = true
  try {
    track('job_deleted', { job_id: jobId, source: 'settings' })
    await deleteJob()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete job', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <JobSubNavActions :job-id="jobId" />

    <div v-if="fetchStatus === 'pending' && !job" class="py-12 text-center text-surface-400">
      Loading...
    </div>

    <template v-if="job">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Job Settings</h1>
        <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
          Manage destructive actions for <strong>{{ job.title }}</strong>.
        </p>
      </div>

      <section class="factory-danger-zone rounded-xl border p-6 mb-12">
        <h2 class="factory-danger-zone-title mb-1 text-base font-semibold">Danger Zone</h2>
        <p class="factory-danger-zone-copy mb-4 text-xs">
          Permanently delete this job and all associated applications.
        </p>

        <div v-if="!showDeleteConfirm">
          <button
            type="button"
            class="factory-button-cta factory-danger-button inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            @click="showDeleteConfirm = true"
          >
            <Trash2 class="size-4" />
            Delete this Job
          </button>
        </div>

        <div v-else class="factory-danger-confirm rounded-lg border p-4">
          <p class="mb-3 text-sm text-surface-700 dark:text-surface-300">
            Are you sure you want to delete <strong>{{ job.title }}</strong>? This will also delete all associated applications. This action cannot be undone.
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              :disabled="isDeleting"
              class="factory-button-cta inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger-700 disabled:cursor-not-allowed disabled:opacity-50"
              @click="handleDelete"
            >
              {{ isDeleting ? 'Deleting...' : 'Yes, Delete' }}
            </button>
            <button
              type="button"
              :disabled="isDeleting"
              class="factory-button-cta factory-toolbar-button inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </template>

    <div
      v-if="fetchStatus !== 'pending' && !job && fetchError"
      class="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-950 dark:text-danger-400"
    >
      {{ fetchError.statusCode === 404 ? 'Job not found.' : 'Failed to load job.' }}
      <NuxtLink :to="$localePath('/dashboard/jobs')" class="ml-1 underline">Back to Jobs</NuxtLink>
    </div>
  </div>
</template>
