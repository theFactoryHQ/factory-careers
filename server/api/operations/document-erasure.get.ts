import { getDocumentErasureOperationsSnapshot } from '../../utils/documentErasureQueue'

export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const snapshot = await getDocumentErasureOperationsSnapshot()
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    ok: true,
    code: 'document_erasure_status',
    workerEnabled: env.DOCUMENT_ERASURE_WORKER_ENABLED,
    ...snapshot,
  }
})
