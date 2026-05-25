type PreviewableDocument = {
  id: string
  originalFilename?: string | null
  mimeType?: string | null
}

export function useDocumentPreview(options: {
  documents: () => PreviewableDocument[] | undefined
  getPreviewUrl: (docId: string) => string
  downloadDocument: (docId: string) => Promise<void>
  onDownloadError?: () => void
}) {
  const showPreview = ref(false)
  const previewUrl = ref<string | null>(null)
  const previewFilename = ref('')
  const previewMimeType = ref('')
  const previewDocId = ref<string | null>(null)
  const previewError = ref<string | null>(null)

  const isPdfPreview = computed(() => previewMimeType.value === 'application/pdf')

  async function handleDownload(docId: string) {
    try {
      await options.downloadDocument(docId)
    } catch {
      options.onDownloadError?.()
    }
  }

  async function handlePreview(docId: string, mimeType?: string | null) {
    const doc = options.documents()?.find((item) => item.id === docId)
    const resolvedMimeType = mimeType ?? doc?.mimeType

    if (resolvedMimeType !== 'application/pdf') {
      await handleDownload(docId)
      return
    }

    previewError.value = null
    showPreview.value = true
    previewDocId.value = docId

    previewFilename.value = doc?.originalFilename ?? 'Document'
    previewMimeType.value = resolvedMimeType
    previewUrl.value = options.getPreviewUrl(docId)
  }

  function closePreview() {
    showPreview.value = false
    previewUrl.value = null
    previewFilename.value = ''
    previewMimeType.value = ''
    previewDocId.value = null
    previewError.value = null
  }

  return {
    showPreview,
    previewUrl,
    previewFilename,
    previewMimeType,
    previewDocId,
    previewError,
    isPdfPreview,
    handlePreview,
    handleDownload,
    closePreview,
  }
}
