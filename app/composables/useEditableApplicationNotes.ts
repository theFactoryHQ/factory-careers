import type { MaybeRefOrGetter } from 'vue'
import { nextTick, ref, toValue } from 'vue'

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
  const notesTextarea = ref<HTMLTextAreaElement | null>(null)

  async function startEditNotes() {
    notesInput.value = toValue(options.application)?.notes ?? ''
    isEditingNotes.value = true

    if (options.focusOnEdit) {
      await nextTick()
      notesTextarea.value?.focus()
    }
  }

  async function saveNotes() {
    isSavingNotes.value = true
    try {
      await options.save(notesInput.value || null)
      await options.afterSave?.()
      isEditingNotes.value = false
    } catch (err: any) {
      if (handlePreviewReadOnlyError(err)) return
      toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    } finally {
      isSavingNotes.value = false
    }
  }

  return {
    isEditingNotes,
    notesInput,
    isSavingNotes,
    notesTextarea,
    startEditNotes,
    saveNotes,
  }
}
