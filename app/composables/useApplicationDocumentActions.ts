import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

type PreviewableDocument = {
  id: string
  originalFilename?: string | null
  mimeType?: string | null
}

type UseApplicationDocumentActionsOptions = {
  candidateId: MaybeRefOrGetter<string | null | undefined>
  documents?: () => PreviewableDocument[] | undefined
  afterMutation?: () => Promise<void> | void
  trackDownloads?: boolean
}

export function useApplicationDocumentActions(options: UseApplicationDocumentActionsOptions) {
  const toast = useToast()
  const { track } = useTrack()
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const { uploadDocument, downloadDocument, getPreviewUrl, deleteDocument } = useDocuments()

  const fileInput = ref<HTMLInputElement | null>(null)
  const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
  const isUploading = ref(false)
  const showDocDeleteConfirm = ref<string | null>(null)
  const isDeletingDoc = ref(false)
  const reparsingDocId = ref<string | null>(null)

  const documentPreview = useDocumentPreview({
    documents: options.documents ?? (() => []),
    getPreviewUrl,
    downloadDocument,
    onDownloadError: () => toast.error('Failed to download document'),
  })

  const documentPreviewState = computed(() => ({
    showPreview: documentPreview.showPreview.value,
    previewUrl: documentPreview.previewUrl.value,
    previewFilename: documentPreview.previewFilename.value,
    previewDocId: documentPreview.previewDocId.value,
    previewError: documentPreview.previewError.value,
    isPdfPreview: documentPreview.isPdfPreview.value,
  }))

  function triggerFileSelect() {
    fileInput.value?.click()
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    const candidateId = toValue(options.candidateId)
    if (!file || !candidateId) return

    isUploading.value = true

    try {
      await uploadDocument(candidateId, file, selectedDocType.value)
      await options.afterMutation?.()
    } catch (err: any) {
      toast.error('Upload failed', {
        message: err?.data?.statusMessage ?? err?.statusMessage ?? 'Upload failed.',
        statusCode: err?.data?.statusCode ?? err?.statusCode,
      })
    } finally {
      isUploading.value = false
      input.value = ''
    }
  }

  async function handleReparse(docId: string) {
    reparsingDocId.value = docId
    try {
      await $fetch(`/api/documents/${docId}/parse`, {
        method: 'POST',
        headers: useRequestHeaders(['cookie']),
      })
      toast.add({ title: 'Resume parsed successfully', type: 'success' })
      await options.afterMutation?.()
    } catch (err: any) {
      toast.add({
        title: 'Parse failed',
        message: err?.data?.statusMessage ?? 'Could not extract text from this document.',
        type: 'error',
      })
    } finally {
      reparsingDocId.value = null
    }
  }

  async function handleDownload(docId: string) {
    try {
      if (options.trackDownloads !== false) {
        track('document_downloaded', { document_id: docId })
      }
      await downloadDocument(docId)
    } catch {
      toast.error('Failed to download document')
    }
  }

  async function handleDeleteDoc(docId: string) {
    const candidateId = toValue(options.candidateId)
    if (!candidateId) return

    isDeletingDoc.value = true
    try {
      await deleteDocument(docId, candidateId)
      await options.afterMutation?.()
      showDocDeleteConfirm.value = null
    } catch (err: any) {
      if (handlePreviewReadOnlyError(err)) return
      toast.error('Failed to delete document', {
        message: err.data?.statusMessage,
        statusCode: err.data?.statusCode,
      })
    } finally {
      isDeletingDoc.value = false
    }
  }

  return {
    fileInput,
    selectedDocType,
    isUploading,
    showDocDeleteConfirm,
    isDeletingDoc,
    reparsingDocId,
    documentPreview,
    documentPreviewState,
    triggerFileSelect,
    handleFileSelected,
    handleReparse,
    handleDownload,
    handleDeleteDoc,
  }
}