export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  try {
    const [row] = await db.execute<{ ready: boolean }>(
      `SELECT
        to_regclass('public.user') IS NOT NULL
        AND (
          SELECT count(*) = 2
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'candidate'
            AND column_name IN ('country', 'state')
        ) AS ready`,
    )

    if (!row?.ready) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Database migrations are not ready',
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
      statusMessage: 'Database is not ready',
    })
  }
})
