<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next'
import type { ApplicationPanelSurface } from '~/composables/useApplicationPanelClass'

const props = withDefaults(defineProps<{
  surface?: ApplicationPanelSurface
  notes?: string | null
  isEditingNotes: boolean
  notesInput: string
  isSavingNotes: boolean
  notesSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  focusOnEdit?: boolean
}>(), {
  surface: 'page',
  notes: null,
  focusOnEdit: false,
})

const emit = defineEmits<{
  'update:notesInput': [value: string]
  startEdit: []
  autosave: []
  save: []
  finishEdit: []
}>()

const panelClass = useApplicationPanelClass(() => props.surface)
const notesTextareaEl = ref<HTMLTextAreaElement | null>(null)

watch(() => props.isEditingNotes, async (editing) => {
  if (editing && props.focusOnEdit) {
    await nextTick()
    notesTextareaEl.value?.focus()
  }
})
</script>

<template>
  <div :class="[panelClass, 'p-5', surface === 'page' ? 'mb-4' : '', surface === 'page' && !isEditingNotes ? 'mt-4' : '']">
    <div class="flex items-center justify-between mb-3" :class="surface === 'sidebar' ? 'mb-4' : ''">
      <div class="flex items-center gap-2" :class="surface === 'sidebar' ? 'gap-2.5' : ''">
        <div
          v-if="surface === 'sidebar'"
          class="ui-icon-state ui-icon-state-warning size-7 rounded-lg"
        >
          <MessageSquare class="size-3.5" />
        </div>
        <MessageSquare v-else class="size-4 text-surface-500 dark:text-surface-400" />
        <h3
          class="text-sm font-semibold"
          :class="surface === 'sidebar'
            ? 'text-surface-800 dark:text-surface-200'
            : 'text-surface-700 dark:text-surface-200'"
        >
          Notes
        </h3>
      </div>
      <button
        v-if="!isEditingNotes && (surface === 'sidebar' || notes)"
        class="font-medium transition-colors"
        :class="surface === 'sidebar'
          ? 'ui-inline-link-brand text-xs'
          : 'cursor-pointer text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300'"
        @click="emit('startEdit')"
      >
        {{ surface === 'sidebar' ? (notes ? 'Edit' : 'Add Notes') : 'Edit' }}
      </button>
    </div>

    <div v-if="isEditingNotes">
      <textarea
        ref="notesTextareaEl"
        :value="notesInput"
        rows="4"
        placeholder="Add notes about this application…"
        :class="surface === 'sidebar'
          ? 'ui-field'
          : 'w-full border border-white/16 bg-black/45 px-3 py-2 text-sm text-white placeholder:text-white/34 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors'"
        @input="emit('update:notesInput', ($event.target as HTMLTextAreaElement).value); emit('autosave')"
        @blur="emit('save')"
      />
      <div class="flex items-center gap-2 mt-2">
        <p class="min-w-0 flex-1 text-xs text-surface-400" role="status">
          {{ notesSaveStatus === 'saving' || isSavingNotes ? 'Saving notes...' : notesSaveStatus === 'saved' ? 'Notes saved' : notesSaveStatus === 'error' ? 'Autosave failed' : 'Automatically saves changes' }}
        </p>
        <button
          :class="surface === 'sidebar'
            ? 'ui-button ui-button-secondary px-3 py-1.5 text-sm'
            : 'factory-toolbar-button cursor-pointer border px-3 py-1.5 text-xs font-medium text-white/78 hover:text-white transition-colors'"
          :disabled="isSavingNotes"
          @click="emit('finishEdit')"
        >
          Done
        </button>
      </div>
    </div>

    <p
      v-else-if="notes"
      class="text-sm whitespace-pre-wrap"
      :class="surface === 'sidebar'
        ? 'leading-relaxed text-surface-600 dark:text-surface-300'
        : 'text-surface-600 dark:text-surface-300'"
    >
      {{ notes }}
    </p>
    <p
      v-else-if="surface === 'sidebar'"
      class="text-sm text-surface-400 italic"
    >
      No notes yet.
    </p>
    <button
      v-else
      type="button"
      class="group flex w-full cursor-pointer items-center justify-between border border-dashed border-white/12 bg-black px-3 py-3 text-left text-sm text-surface-400 transition-colors hover:border-brand-500/70 hover:bg-brand-500/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      @click="emit('startEdit')"
    >
      <span class="italic">No notes yet.</span>
      <span class="text-xs font-semibold uppercase text-brand-400 transition-colors group-hover:text-brand-300">Add Notes</span>
    </button>
  </div>
</template>