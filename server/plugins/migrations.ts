import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../database/schema'

const MIGRATION_LOCK_ID = 123456789

interface MigrationSessionDependencies<Client, Database> {
  databaseUrl: string
  createClient: (databaseUrl: string, options: { max: 1 }) => Client
  createDatabase: (client: Client) => Database
  execute: (database: Database, statement: string) => Promise<unknown>
  migrate: (database: Database) => Promise<void>
  close: (client: Client) => Promise<void>
}

/**
 * Run migrations while a single, dedicated PostgreSQL session owns the
 * advisory lock. A blocking advisory lock makes concurrent instances wait for
 * the active migrator instead of starting against an unverified schema.
 */
export async function runMigrationsOnSession<Client, Database>({
  databaseUrl,
  createClient,
  createDatabase,
  execute,
  migrate: runMigrations,
  close,
}: MigrationSessionDependencies<Client, Database>): Promise<void> {
  const client = createClient(databaseUrl, { max: 1 })
  let database: Database | undefined
  let lockAcquired = false
  let failed = false
  let failure: unknown

  try {
    database = createDatabase(client)

    await execute(database, `SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`)
    lockAcquired = true

    await execute(database, 'SET client_min_messages TO warning')
    await runMigrations(database)
    await execute(database, 'SET client_min_messages TO notice')
  } catch (error) {
    failed = true
    failure = error
  } finally {
    if (lockAcquired && database !== undefined) {
      try {
        await execute(database, `SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`)
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
      }
    }

    try {
      await close(client)
    } catch (error) {
      if (!failed) {
        failed = true
        failure = error
      }
    }
  }

  if (failed) throw failure
}

export default defineNitroPlugin(async () => {
  // Skip during build-time prerendering — database isn't available
  if (import.meta.prerender) return

  // Temporary bootstrap services can opt out until DATABASE_URL is wired.
  if (env.SKIP_RUNTIME_MIGRATIONS || process.env.RAILWAY_ENVIRONMENT_ID) {
    console.log('[Factory Careers] Skipping runtime migrations')
    logInfo('migrations.skipped_runtime')
    return
  }

  try {
    console.log('[Factory Careers] Waiting for the database migration lock...')

    await runMigrationsOnSession({
      databaseUrl: env.DATABASE_URL,
      createClient: (databaseUrl, options) => postgres(databaseUrl, options),
      createDatabase: client => drizzle(client, { schema }),
      execute: async (database, statement) => {
        await database.execute(statement)
      },
      migrate: async (database) => {
        console.log('[Factory Careers] Running database migrations...')
        await migrate(database, {
          migrationsFolder: './server/database/migrations',
        })
      },
      close: async (client) => {
        await client.end({ timeout: 5 })
      },
    })

    console.log('[Factory Careers] Database migrations applied successfully')
    logInfo('migrations.completed')
  } catch (error) {
    console.error('[Factory Careers] Migration failed:', error)
    logError('migrations.failed', {
      error_message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
})
