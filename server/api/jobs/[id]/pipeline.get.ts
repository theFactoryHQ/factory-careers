import { idParamSchema } from '../../../utils/schemas/job'
import { jobPipelineQuerySchema } from '../../../utils/schemas/jobPipeline'
import { loadJobPipeline } from '../../../utils/jobPipeline'

export default defineEventHandler(async event => {
  const session = await requirePermission(event, { application: ['read'] })
  const organizationId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, idParamSchema.parse)
  const query = await getValidatedQuery(event, jobPipelineQuerySchema.parse)
  const pipeline = await loadJobPipeline({ organizationId, jobId, query })

  if (!pipeline) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return pipeline
})
