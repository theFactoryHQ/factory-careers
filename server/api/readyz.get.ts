import { getSsoStorageReadiness } from '../utils/ssoReadiness'
import { getDependencyReadiness } from '../utils/dependencyReadiness'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  try {
    const [row] = await db.execute<{ ready: boolean }>('SELECT true AS ready')
    const dependencies = getDependencyReadiness()

    if (!row?.ready || !Object.values(dependencies).every(Boolean) || !getSsoStorageReadiness().ready) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Application is not ready',
      })
    }

    return { ok: true }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 503,
      statusMessage: 'Application is not ready',
    })
  }
})
