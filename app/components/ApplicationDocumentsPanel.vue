<script setup lang="ts">
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Trash2,
} from 'lucide-vue-next'
import type { ApplicationPanelSurface } from '~/composables/useApplicationPanelClass'
import { DOCUMENT_TYPE_LABELS } from '~/utils/document-display'

const props = withDefaults(defineProps<{
  documents?: any[]
  preview: {
    showPreview: boolean
    previewUrl: string | null
    previewFilename: string
    previewDocId: string | null
    previewError?: string | null
    isPdfPreview: boolean
  }
  surface?: ApplicationPanelSurface
  allowDelete?: boolean
  allowReparse?: boolean
  reparsingDocId?: string | null
  emptyDescription?: string
  previewHeight?: string
}>(), {
  documents: () => [],
  surface: 'sidebar',
  allowDelete: true,
  allowReparse: false,
  reparsingDocId: null,
  emptyDescription: '',
  previewHeight: 'calc(100vh - 280px)',
})

const emit = defineEmits<{
  preview: [docId: string, mimeType?: string | null]
  download: [docId: string]
  delete: [docId: string]
  reparse: [docId: string]
  closePreview: []
}>()

const panelClass = useApplicationPanelClass(() => props.surface)

function isPdfDocument(doc: { mimeType?: string | null }) {
  return doc.mimeType === 'application/pdf'
}

function previewDocument(doc: { id: string, mimeType?: string | null }) {
  if (isPdfDocument(doc)) {
    emit('preview', doc.id, doc.mimeType)
  }
}
</script>

<template>
  <div class="space-y-4">
    <template v-if="preview.showPreview">
      <div class="flex items-center justify-between">
        <button
          class="factory-toolbar-button inline-flex h-10 min-h-10 items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors hover:bg-white hover:text-black"
          @click="emit('closePreview')"
        >
          <ArrowLeft class="size-3.5" />
          Back to documents
        </button>
        <div class="flex items-center gap-1">
          <button
            v-if="preview.previewDocId"
            class="ui-button ui-button-ghost p-1.5"
            title="Download"
            @click="emit('download', preview.previewDocId)"
          >
            <Download class="size-4" />
          </button>
        </div>
      </div>

      <div v-if="preview.previewFilename" class="flex items-center gap-2">
        <FileText class="size-4 text-surface-400 shrink-0" />
        <span class="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">
          {{ preview.previewFilename }}
        </span>
      </div>

      <div
        v-if="preview.previewError"
        class="ui-alert ui-alert-danger p-6 text-center"
      >
        <AlertTriangle class="size-8 text-danger-400 mx-auto mb-2" />
        <p class="text-sm text-danger-700 dark:text-danger-400">{{ preview.previewError }}</p>
        <button
          class="ui-inline-link-brand mt-3 text-sm font-medium"
          @click="emit('closePreview')"
        >
          Go back
        </button>
      </div>

      <iframe
        v-else-if="preview.previewUrl && preview.isPdfPreview"
        :src="preview.previewUrl"
        class="w-full rounded-lg border border-surface-200 dark:border-surface-800"
        :style="{ height: previewHeight }"
        title="Document preview"
      />
    </template>

    <template v-else>
      <slot name="toolbar" />

      <div
        v-if="!documents.length"
        class="ui-empty-panel p-8"
      >
        <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
          <FileText class="size-6 text-surface-400 dark:text-surface-500" />
        </div>
        <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No documents yet.</p>
        <p v-if="emptyDescription" class="text-xs text-surface-400 dark:text-surface-500 mt-1">
          {{ emptyDescription }}
        </p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="doc in documents"
          :key="doc.id"
          :class="[panelClass, 'group flex items-center justify-between px-4 py-3 transition-colors', isPdfDocument(doc) ? 'cursor-pointer hover:border-brand-300 dark:hover:border-brand-700 hover:bg-brand-50/50 dark:hover:bg-brand-950/30' : '']"
          @click="isPdfDocument(doc) ? previewDocument(doc) : undefined"
        >
          <div class="flex items-center gap-3 min-w-0">
            <FileText class="size-4 shrink-0" :class="isPdfDocument(doc) ? 'text-danger-500 dark:text-danger-400' : 'text-surface-400'" />
            <div class="min-w-0">
              <p class="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">
                {{ doc.originalFilename }}
              </p>
              <span class="text-xs text-surface-400">
                {{ DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type }}
                · {{ new Date(doc.createdAt).toLocaleDateString() }}
                <template v-if="doc.parsed === false">
                  · <span class="text-warning-500 dark:text-warning-400">Text extraction failed</span>
                </template>
                <template v-else-if="isPdfDocument(doc)"> · <span class="text-brand-500 dark:text-brand-400">Click to preview</span></template>
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0" @click.stop>
            <button
              v-if="allowReparse && doc.parsed === false"
              :disabled="reparsingDocId === doc.id"
              class="ui-button ui-button-ghost p-1.5 text-warning-500 disabled:opacity-50"
              title="Retry text extraction"
              @click="emit('reparse', doc.id)"
            >
              <RefreshCw class="size-4" :class="{ 'animate-spin': reparsingDocId === doc.id }" />
            </button>
            <button
              v-if="isPdfDocument(doc)"
              class="ui-button ui-button-ghost p-1.5"
              title="Preview PDF"
              @click="previewDocument(doc)"
            >
              <Eye class="size-4" />
            </button>
            <button
              class="ui-button ui-button-ghost p-1.5"
              title="Download"
              @click="emit('download', doc.id)"
            >
              <Download class="size-4" />
            </button>
            <button
              v-if="allowDelete"
              class="ui-button ui-button-ghost ui-button-ghost-danger p-1.5"
              title="Delete"
              @click="emit('delete', doc.id)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>