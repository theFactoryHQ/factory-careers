import type { MaybeRefOrGetter } from 'vue'
import { nextTick, onScopeDispose, ref, toValue } from 'vue'

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
  let activeNotesSave: Promise<boolean> | null = null
  let queuedNotesSave = false

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

  async function runQueuedNotesSave(): Promise<boolean> {
    isSavingNotes.value = true
    let allSavesSucceeded = true

    try {
      do {
        queuedNotesSave = false
        notesSaveStatus.value = 'saving'

        try {
          await options.save(notesInput.value || null)
          await options.afterSave?.()
          notesSaveStatus.value = 'saved'
          clearSavedStatusTimer()
          savedStatusTimer = setTimeout(() => {
            notesSaveStatus.value = 'idle'
          }, 2500)
        } catch (err: any) {
          if (!handlePreviewReadOnlyError(err)) {
            notesSaveStatus.value = 'error'
            toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
          }
          allSavesSucceeded = false
          break
        }
      } while (queuedNotesSave)
    } finally {
      isSavingNotes.value = false
    }

    return allSavesSucceeded
  }

  function saveNotes(): Promise<boolean> {
    clearAutosaveTimer()
    clearSavedStatusTimer()

    if (activeNotesSave) {
      queuedNotesSave = true
      return activeNotesSave
    }

    activeNotesSave = runQueuedNotesSave().finally(() => {
      activeNotesSave = null
    })
    return activeNotesSave
  }

  function autosaveNotes() {
    // Save notes after typing stops so each keystroke does not issue a PATCH.
    clearAutosaveTimer()
    notesSaveStatus.value = 'idle'
    autosaveTimer = setTimeout(() => {
      void saveNotes()
    }, 700)
  }

  async function finishEditNotes() {
    const saved = await saveNotes()
    if (saved) isEditingNotes.value = false
  }

  onScopeDispose(() => {
    const hasPendingAutosave = autosaveTimer !== null
    clearAutosaveTimer()
    clearSavedStatusTimer()

    // A keyed drawer is disposed immediately when the selected application
    // changes. Flush its debounced edit through the old application's save
    // closure so those notes can never be applied to the newly selected row.
    if (hasPendingAutosave) void saveNotes()
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
    finishEditNotes,
  }
}
