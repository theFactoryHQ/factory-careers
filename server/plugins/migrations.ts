import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from '../utils/db'

export default defineNitroPlugin(async () => {
  // Skip during build-time prerendering — database isn't available
  if (import.meta.prerender) return

<<<<<<< HEAD
  // Temporary bootstrap services can opt out until DATABASE_URL is wired.
  if (env.SKIP_RUNTIME_MIGRATIONS || process.env.RAILWAY_ENVIRONMENT_ID) {
    console.log('[Factory Careers] Skipping runtime migrations')
    logInfo('migrations.skipped_runtime')
=======
  // Railway handles schema sync via preDeploy commands.
  // Running runtime migrations there can conflict with drizzle-kit push/migrate.
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    console.log('[Factory Careers] Skipping runtime migrations on Railway (handled in preDeploy)')
    logInfo('migrations.skipped_railway')
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
    return
  }

  // Advisory lock ID — prevents concurrent migration runs across instances.
  // The lock is automatically released when the transaction/session ends.
  const MIGRATION_LOCK_ID = 123456789

  try {
    // pg_try_advisory_lock returns true if lock acquired, false if another process holds it
    const lockResult = await db.execute<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) as locked`
    )
    const locked = lockResult[0]?.locked ?? false

    if (!locked) {
      console.log('[Factory Careers] Another instance is running migrations, skipping')
      logInfo('migrations.skipped_locked')
      return
    }

    console.log('[Factory Careers] Running database migrations...')
    // Suppress harmless NOTICE messages (e.g. "schema already exists, skipping")
    await db.execute(`SET client_min_messages TO warning`)
    await migrate(db, {
      migrationsFolder: './server/database/migrations',
    })
    await db.execute(`SET client_min_messages TO notice`)
    console.log('[Factory Careers] Database migrations applied successfully')
    logInfo('migrations.completed')
  } catch (error) {
    console.error('[Factory Careers] Migration failed:', error)
    logError('migrations.failed', {
      error_message: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    await db.execute(
      `SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`
    ).catch(() => {})
  }
})
