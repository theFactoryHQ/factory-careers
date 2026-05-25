import type { MaybeRefOrGetter } from 'vue'
import { nextTick, onBeforeUnmount, ref, toValue } from 'vue'

type ApplicationWithNotes = {
  notes?: string | null
}

type UseEditableApplicationNotesOptions = {
  application: MaybeRefOrGetter<ApplicationWithNotes | null | undefined>
  save: (notes: string | null) => Promise<unknown>
  afterSave?: () => Promise<unknown> | unknown
  focusOnEdit?: boolean
}

export function useEditableApplicationNotes(options: UseEditableApplicationNotesOptions) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const toast = useToast()

  const isEditingNotes = ref(false)
  const notesInput = ref('')
  const isSavingNotes = ref(false)
  const notesSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const notesTextarea = ref<HTMLTextAreaElement | null>(null)
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  let savedStatusTimer: ReturnType<typeof setTimeout> | null = null

  function clearAutosaveTimer() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
  }

  function clearSavedStatusTimer() {
    if (savedStatusTimer) {
      clearTimeout(savedStatusTimer)
      savedStatusTimer = null
    }
  }

  async function startEditNotes() {
    notesInput.value = toValue(options.application)?.notes ?? ''
    isEditingNotes.value = true
    notesSaveStatus.value = 'idle'

    if (options.focusOnEdit) {
      await nextTick()
      notesTextarea.value?.focus()
    }
  }

  async function saveNotes() {
    clearAutosaveTimer()
    clearSavedStatusTimer()
    isSavingNotes.value = true
    notesSaveStatus.value = 'saving'
    try {
      await options.save(notesInput.value || null)
      await options.afterSave?.()
      notesSaveStatus.value = 'saved'
      savedStatusTimer = setTimeout(() => {
        notesSaveStatus.value = 'idle'
      }, 2500)
    } catch (err: any) {
      if (handlePreviewReadOnlyError(err)) return
      notesSaveStatus.value = 'error'
      toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    } finally {
      isSavingNotes.value = false
    }
  }

  function autosaveNotes() {
    // Save notes after typing stops so each keystroke does not issue a PATCH.
    clearAutosaveTimer()
    notesSaveStatus.value = 'idle'
    autosaveTimer = setTimeout(() => {
      void saveNotes()
    }, 700)
  }

  onBeforeUnmount(() => {
    clearAutosaveTimer()
    clearSavedStatusTimer()
  })

  return {
    isEditingNotes,
    notesInput,
    isSavingNotes,
    notesSaveStatus,
    notesTextarea,
    startEditNotes,
    saveNotes,
    autosaveNotes,
  }
}
