import { z } from 'zod'
import { getDocumentErasureOperationsSnapshot } from '../../../utils/documentErasureQueue'
import { processDocumentErasureCycle } from '../../../utils/processDocumentErasures'

const bodySchema = z.object({
  confirm: z.literal(true),
  limit: z.number().int().min(1).max(50).default(10),
}).strict()

export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const cycle = await processDocumentErasureCycle({ limit: body.limit })
  const snapshot = await getDocumentErasureOperationsSnapshot()
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    ok: true,
    code: 'document_erasure_drain_completed',
    workerEnabled: env.DOCUMENT_ERASURE_WORKER_ENABLED,
    cycle,
    ...snapshot,
  }
})
