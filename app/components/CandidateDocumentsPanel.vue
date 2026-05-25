<script setup lang="ts">
import { AlertTriangle, ArrowLeft, Download, Eye, FileText, Trash2 } from 'lucide-vue-next'

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
  surface?: 'drawer' | 'page'
  allowDelete?: boolean
  emptyDescription?: string
  previewHeight?: string
}>(), {
  documents: () => [],
  surface: 'page',
  allowDelete: false,
  emptyDescription: '',
  previewHeight: '70vh',
})

const emit = defineEmits<{
  preview: [docId: string, mimeType?: string | null]
  download: [docId: string]
  delete: [docId: string]
  closePreview: []
}>()

const panelClass = useCandidatePanelClass(() => props.surface)

const documentTypeLabels: Record<string, string> = {
  resume: 'Resume',
  cover_letter: 'Cover Letter',
  other: 'Other',
}

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
  <div>
    <template v-if="preview.showPreview">
      <div class="mb-3 flex items-center justify-between">
        <button
          class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 border px-3 py-0 text-xs font-medium transition-colors hover:bg-white hover:text-black"
          @click="emit('closePreview')"
        >
          <ArrowLeft class="size-3.5" />
          Back to documents
        </button>
        <div class="flex items-center gap-1">
          <button
            v-if="preview.previewDocId"
            class="factory-toolbar-button inline-flex size-10 min-h-10 cursor-pointer items-center justify-center border p-0 text-white/58 transition-colors hover:text-white"
            title="Download"
            @click="emit('download', preview.previewDocId)"
          >
            <Download class="size-4" />
          </button>
        </div>
      </div>

      <div v-if="preview.previewFilename" :class="[panelClass, 'mb-3 flex items-center gap-2 px-3 py-2']">
        <FileText class="size-4 shrink-0 text-white/38" />
        <span class="truncate text-sm font-medium text-white/78">
          {{ preview.previewFilename }}
        </span>
      </div>

      <div
        v-if="preview.previewError"
        class="border border-danger-500/45 bg-danger-500/10 p-6 text-center"
      >
        <AlertTriangle class="mx-auto mb-2 size-8 text-danger-300" />
        <p class="text-sm text-danger-100">{{ preview.previewError }}</p>
        <button
          class="mt-3 cursor-pointer text-sm font-medium text-brand-400 transition-colors hover:text-white"
          @click="emit('closePreview')"
        >
          Go back
        </button>
      </div>

      <iframe
        v-else-if="preview.previewUrl && preview.isPdfPreview"
        :src="preview.previewUrl"
        class="w-full border border-white/12"
        :style="{ height: previewHeight }"
        title="Document preview"
      />
    </template>

    <template v-else>
      <slot name="toolbar" />
      <slot name="error" />

      <div
        v-if="!documents.length"
        :class="[panelClass, 'p-8 text-center']"
      >
        <FileText class="mx-auto mb-2 size-8 text-white/32" />
        <p class="text-sm text-white/54">No documents yet.</p>
        <p v-if="emptyDescription" class="mt-1 text-xs text-white/38">
          {{ emptyDescription }}
        </p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="doc in documents"
          :key="doc.id"
          :class="[panelClass, 'group flex items-center justify-between px-4 py-3 transition-colors', isPdfDocument(doc) ? 'cursor-pointer hover:border-brand-500/70 hover:bg-brand-500/10' : '']"
          :role="isPdfDocument(doc) ? 'button' : undefined"
          :tabindex="isPdfDocument(doc) ? 0 : undefined"
          @click="previewDocument(doc)"
          @keydown.enter.prevent="previewDocument(doc)"
          @keydown.space.prevent="previewDocument(doc)"
        >
          <div class="flex min-w-0 items-center gap-3">
            <FileText class="size-4 shrink-0" :class="isPdfDocument(doc) ? 'text-danger-300' : 'text-white/38'" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-white/82">
                {{ doc.originalFilename }}
              </p>
              <span class="text-xs text-white/42">
                {{ documentTypeLabels[doc.type] ?? doc.type }}
                · <TimelineDateLink :date="doc.createdAt">{{ new Date(doc.createdAt).toLocaleDateString() }}</TimelineDateLink>
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1" @click.stop>
            <button
              v-if="isPdfDocument(doc)"
              class="factory-toolbar-button inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0 text-white/58 transition-colors hover:text-white"
              title="Preview PDF"
              @click="previewDocument(doc)"
            >
              <Eye class="size-4" />
            </button>
            <button
              class="factory-toolbar-button inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0 text-white/58 transition-colors hover:text-white"
              title="Download"
              @click="emit('download', doc.id)"
            >
              <Download class="size-4" />
            </button>
            <button
              v-if="allowDelete"
              class="factory-toolbar-button inline-flex size-9 min-h-9 cursor-pointer items-center justify-center border p-0 text-danger-200 transition-colors hover:border-danger-400 hover:bg-danger-500/12 hover:text-white"
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
