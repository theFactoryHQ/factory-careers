import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { PgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../database/schema'
import {
  backfillSsoProviderClientSecrets,
  validateSsoProviderClientSecrets,
  type SsoProviderSecretBackfillResult,
  type SsoProviderSecretStorageMode,
  type SsoProviderSecretValidationResult,
} from '../utils/ssoProviderSecrets'
import {
  markSsoStorageFailed,
  markSsoStorageReady,
  resetSsoStorageReadiness,
} from '../utils/ssoReadiness'

const MIGRATION_LOCK_ID = 123456789

interface MigrationExecutionInput {
  nodeEnv: string
  databaseUrl: string
  migrationDatabaseUrl?: string
  skipRuntimeMigrations: boolean
  railwayEnvironmentId?: string
}

export function resolveMigrationExecution({
  nodeEnv,
  databaseUrl,
  migrationDatabaseUrl,
  skipRuntimeMigrations,
  railwayEnvironmentId,
}: MigrationExecutionInput): { databaseUrl: string, skipSchemaMigrations: boolean } {
  const skipSchemaMigrations = skipRuntimeMigrations || Boolean(railwayEnvironmentId)

  if (nodeEnv === 'production' && skipSchemaMigrations) {
    throw new Error('Production schema migrations cannot be skipped')
  }

  if (nodeEnv === 'production' && !migrationDatabaseUrl) {
    throw new Error('DATABASE_MIGRATION_URL is required for production schema migrations')
  }

  if (
    nodeEnv === 'production'
    && migrationDatabaseUrl
    && new URL(migrationDatabaseUrl).username === new URL(databaseUrl).username
  ) {
    throw new Error('DATABASE_MIGRATION_URL must use a database role distinct from DATABASE_URL')
  }

  return {
    databaseUrl: migrationDatabaseUrl || databaseUrl,
    skipSchemaMigrations,
  }
}

export function findMissingRuntimeSchemaColumns(
  expected: Record<string, string[]>,
  actual: Record<string, string[]>,
): string[] {
  const missing: string[] = []

  for (const [tableName, expectedColumns] of Object.entries(expected)) {
    const actualColumns = new Set(actual[tableName] ?? [])
    for (const columnName of expectedColumns) {
      if (!actualColumns.has(columnName)) {
        missing.push(`${tableName}.${columnName}`)
      }
    }
  }

  return missing.sort()
}

interface ExpectedMigration {
  folderMillis: number
  hash: string
}

interface AppliedMigration {
  createdAt: string
  hash: string
}

export function findMigrationLedgerDrift(
  expected: ExpectedMigration[],
  actual: AppliedMigration[],
): string[] {
  const appliedByTimestamp = new Map(actual.map(migration => [migration.createdAt, migration.hash]))
  const drift: string[] = []

  for (const migration of expected) {
    const timestamp = String(migration.folderMillis)
    const appliedHash = appliedByTimestamp.get(timestamp)
    if (appliedHash === undefined) {
      drift.push(`${timestamp}:missing`)
    }
    else if (appliedHash !== migration.hash) {
      drift.push(`${timestamp}:hash-mismatch`)
    }
  }

  const expectedTimestamps = new Set(expected.map(migration => String(migration.folderMillis)))
  for (const migration of actual) {
    if (!expectedTimestamps.has(migration.createdAt)) {
      drift.push(`${migration.createdAt}:unexpected`)
    }
  }

  return drift.sort()
}

export function migrationCompletionSummary(
  schemaMigrationsSkipped: boolean,
): { message: string, details: Record<string, boolean> } {
  return {
    message: schemaMigrationsSkipped
      ? 'Runtime database schema verified; schema migrations were skipped'
      : 'Database migrations applied and runtime schema verified successfully',
    details: {
      schema_migrations_skipped: schemaMigrationsSkipped,
      schema_verified: true,
    },
  }
}

function expectedRuntimeSchemaColumns(): Record<string, string[]> {
  const expected: Record<string, string[]> = {}

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue

    const tableName = getTableName(value)
    expected[tableName] = Object.values(getTableColumns(value))
      .map(column => column.name)
      .sort()
  }

  return expected
}

async function assertRuntimeSchemaMatchesDrizzle(client: postgres.Sql): Promise<void> {
  const rows = await client<{ table_name: string, column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `
  const actual: Record<string, string[]> = {}
  for (const row of rows) {
    actual[row.table_name] ??= []
    actual[row.table_name]!.push(row.column_name)
  }

  const missing = findMissingRuntimeSchemaColumns(expectedRuntimeSchemaColumns(), actual)
  if (missing.length > 0) {
    throw new Error(
      `Runtime database schema is missing ${missing.length} modeled columns: ${missing.slice(0, 20).join(', ')}`,
    )
  }
}

async function assertMigrationLedgerMatchesBundle(client: postgres.Sql): Promise<void> {
  const expected = readMigrationFiles({
    migrationsFolder: './server/database/migrations',
  })
  const rows = await client<{ created_at: string, hash: string }[]>`
    SELECT created_at::text AS created_at, hash
    FROM drizzle.__drizzle_migrations
  `
  const drift = findMigrationLedgerDrift(
    expected,
    rows.map(row => ({ createdAt: row.created_at, hash: row.hash })),
  )

  if (drift.length > 0) {
    throw new Error(
      `Database migration ledger does not match the bundled migrations: ${drift.slice(0, 20).join(', ')}`,
    )
  }
}

interface PrepareSsoProviderSecretStorageOptions {
  client: postgres.Sql
  secret: string
  mode: SsoProviderSecretStorageMode
  validate?: (
    client: postgres.Sql,
    secret: string,
  ) => Promise<SsoProviderSecretValidationResult>
  backfill?: (
    client: postgres.Sql,
    secret: string,
  ) => Promise<SsoProviderSecretBackfillResult>
  markReady?: () => void
  markFailed?: (error: unknown) => void
}

export async function prepareSsoProviderSecretStorage({
  client,
  secret,
  mode,
  validate = validateSsoProviderClientSecrets,
  backfill = backfillSsoProviderClientSecrets,
  markReady = markSsoStorageReady,
  markFailed = markSsoStorageFailed,
}: PrepareSsoProviderSecretStorageOptions): Promise<void> {
  resetSsoStorageReadiness()

  try {
    const before = await validate(client, secret)
    logInfo('sso_provider_secrets.validation_completed', {
      mode,
      scanned_count: before.scanned,
      plaintext_count: before.plaintext,
      encrypted_count: before.encrypted,
      without_client_secret_count: before.withoutClientSecret,
    })

    if (mode === 'encrypted') {
      const migration = await backfill(client, secret)
      logInfo('sso_provider_secrets.backfill_completed', {
        scanned_count: migration.scanned,
        encrypted_count: migration.encrypted,
        already_encrypted_count: migration.alreadyEncrypted,
        without_client_secret_count: migration.withoutClientSecret,
      })

      const after = await validate(client, secret)
      logInfo('sso_provider_secrets.post_validation_completed', {
        scanned_count: after.scanned,
        plaintext_count: after.plaintext,
        encrypted_count: after.encrypted,
        without_client_secret_count: after.withoutClientSecret,
      })
    }

    markReady()
  }
  catch (error) {
    markFailed(error)
    throw error
  }
}

interface MigrationSessionDependencies<Client, Database> {
  databaseUrl: string
  createClient: (databaseUrl: string, options: { max: 1 }) => Client
  createDatabase: (client: Client) => Database
  execute: (database: Database, statement: string) => Promise<unknown>
  migrate: (database: Database, client: Client) => Promise<void>
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
    await runMigrations(database, client)
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
  resetSsoStorageReadiness()

  // Temporary bootstrap services can opt out of schema migrations. The SSO
  // secret backfill still runs because it is a key-dependent data migration
  // that cannot be represented safely in SQL.
  const migrationExecution = resolveMigrationExecution({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    migrationDatabaseUrl: env.DATABASE_MIGRATION_URL,
    skipRuntimeMigrations: env.SKIP_RUNTIME_MIGRATIONS,
    railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID,
  })
  const { skipSchemaMigrations } = migrationExecution
  if (skipSchemaMigrations) {
    console.log('[Factory Careers] Skipping runtime migrations')
    logInfo('migrations.skipped_runtime')
  }

  try {
    console.log('[Factory Careers] Waiting for the database migration lock...')

    await runMigrationsOnSession({
      databaseUrl: migrationExecution.databaseUrl,
      createClient: (databaseUrl, options) => postgres(databaseUrl, options),
      createDatabase: client => drizzle(client, { schema }),
      execute: async (database, statement) => {
        await database.execute(statement)
      },
      migrate: async (database, client) => {
        if (!skipSchemaMigrations) {
          console.log('[Factory Careers] Running database migrations...')
          await migrate(database, {
            migrationsFolder: './server/database/migrations',
          })
          await assertMigrationLedgerMatchesBundle(client)
        }

        await assertRuntimeSchemaMatchesDrizzle(client)

        await prepareSsoProviderSecretStorage({
          client,
          secret: env.BETTER_AUTH_SECRET,
          mode: env.SSO_PROVIDER_SECRET_STORAGE_MODE,
        })
      },
      close: async (client) => {
        await client.end({ timeout: 5 })
      },
    })

    const completion = migrationCompletionSummary(skipSchemaMigrations)
    console.log(`[Factory Careers] ${completion.message}`)
    logInfo('migrations.completed', completion.details)
  } catch (error) {
    markSsoStorageFailed(error)
    console.error('[Factory Careers] Migration failed:', error)
    logError('migrations.failed', {
      error_message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
})
