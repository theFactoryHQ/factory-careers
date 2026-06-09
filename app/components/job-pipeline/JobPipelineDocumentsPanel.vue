<script setup lang="ts">
import { Eye, Download, FileText, Paperclip } from 'lucide-vue-next'

export type PipelineDocument = {
  id: string
  type: 'resume' | 'cover_letter' | 'other'
  originalFilename: string
  mimeType: string
  createdAt: string | Date
}

const props = defineProps<{
  documents: PipelineDocument[]
}>()

const emit = defineEmits<{
  preview: [doc: PipelineDocument]
}>()

function formatDocumentType(value: PipelineDocument['type']) {
  if (value === 'cover_letter') return 'Cover Letter'
  if (value === 'resume') return 'Resume'
  return 'Other'
}
</script>

<template>
  <div class="space-y-3">
    <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2 mb-3">
      <Paperclip class="size-4 text-surface-400 dark:text-surface-500" />
      Documents
    </h2>
    <div v-if="props.documents.length" class="space-y-3">
      <div
        v-for="doc in props.documents"
        :key="doc.id"
        class="flex flex-wrap items-center justify-between gap-3 ui-panel ui-dashboard-panel px-5 py-4 transition-colors hover:border-surface-300 dark:hover:border-surface-700"
      >
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-100 dark:bg-surface-800/60">
            <FileText class="size-4.5 text-surface-500 dark:text-surface-400" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">
              {{ doc.originalFilename }}
            </p>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {{ formatDocumentType(doc.type) }} · <TimelineDateLink :date="doc.createdAt">{{ new Date(doc.createdAt).toLocaleDateString() }}</TimelineDateLink>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 hover:border-surface-300 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:border-surface-600 transition-all duration-150"
            @click="emit('preview', doc)"
          >
            <Eye class="size-3.5" />
            Preview
          </button>
          <a
            :href="`/api/documents/${doc.id}/download`"
            class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 hover:border-surface-300 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:border-surface-600 transition-all duration-150"
          >
            <Download class="size-3.5" />
            Download
          </a>
        </div>
      </div>
    </div>
    <div v-else class="ui-panel ui-dashboard-panel p-10 text-center">
      <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
        <FileText class="size-6 text-surface-400 dark:text-surface-500" />
      </div>
      <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No documents uploaded</p>
      <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">Documents will appear here once uploaded.</p>
    </div>
  </div>
</template>