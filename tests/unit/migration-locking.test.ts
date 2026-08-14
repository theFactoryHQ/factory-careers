import { beforeAll, describe, expect, it, vi } from 'vitest'

type RunMigrationsOnSession = typeof import('../../server/plugins/migrations').runMigrationsOnSession
type PrepareSsoProviderSecretStorage = typeof import('../../server/plugins/migrations').prepareSsoProviderSecretStorage

let runMigrationsOnSession: RunMigrationsOnSession
let prepareSsoProviderSecretStorage: PrepareSsoProviderSecretStorage

beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  ;({ runMigrationsOnSession, prepareSsoProviderSecretStorage } = await import('../../server/plugins/migrations'))
})

describe('runtime migration locking', () => {
  it('refuses to skip schema migrations in production', async () => {
    const migrationModule = await import('../../server/plugins/migrations') as Record<string, unknown>
    const resolveMigrationExecution = migrationModule.resolveMigrationExecution as undefined | ((input: {
      nodeEnv: string
      databaseUrl: string
      migrationDatabaseUrl?: string
      skipRuntimeMigrations: boolean
      railwayEnvironmentId?: string
    }) => unknown)

    expect(() => resolveMigrationExecution?.({
      nodeEnv: 'production',
      databaseUrl: 'postgres://app-role:secret@database.internal/careers',
      migrationDatabaseUrl: 'postgres://migration-role:secret@database.internal/careers',
      skipRuntimeMigrations: true,
    })).toThrow('Production schema migrations cannot be skipped')
  })

  it('uses the dedicated migration role for production schema changes', async () => {
    const migrationModule = await import('../../server/plugins/migrations') as Record<string, unknown>
    const resolveMigrationExecution = migrationModule.resolveMigrationExecution as undefined | ((input: {
      nodeEnv: string
      databaseUrl: string
      migrationDatabaseUrl?: string
      skipRuntimeMigrations: boolean
      railwayEnvironmentId?: string
    }) => unknown)

    expect(resolveMigrationExecution?.({
      nodeEnv: 'production',
      databaseUrl: 'postgres://app-role:secret@database.internal/careers',
      migrationDatabaseUrl: 'postgres://migration-role:secret@database.internal/careers',
      skipRuntimeMigrations: false,
    })).toEqual({
      databaseUrl: 'postgres://migration-role:secret@database.internal/careers',
      skipSchemaMigrations: false,
    })
  })

  it('rejects the application role as the production migration role at runtime', async () => {
    const migrationModule = await import('../../server/plugins/migrations') as Record<string, unknown>
    const resolveMigrationExecution = migrationModule.resolveMigrationExecution as undefined | ((input: {
      nodeEnv: string
      databaseUrl: string
      migrationDatabaseUrl?: string
      skipRuntimeMigrations: boolean
      railwayEnvironmentId?: string
    }) => unknown)

    expect(() => resolveMigrationExecution?.({
      nodeEnv: 'production',
      databaseUrl: 'postgres://app-role:one@database.internal/careers',
      migrationDatabaseUrl: 'postgres://app-role:two@database.internal/careers',
      skipRuntimeMigrations: false,
    })).toThrow('must use a database role distinct from DATABASE_URL')
  })

  it('reports every missing modeled table and column before startup completes', async () => {
    const migrationModule = await import('../../server/plugins/migrations') as Record<string, unknown>
    const findMissingRuntimeSchemaColumns = migrationModule.findMissingRuntimeSchemaColumns as undefined | ((
      expected: Record<string, string[]>,
      actual: Record<string, string[]>,
    ) => string[])

    expect(findMissingRuntimeSchemaColumns?.(
      {
        org_settings: ['organization_id', 'send_application_acknowledgement'],
        candidate_workflow_email_queue: ['id', 'application_id'],
      },
      {
        org_settings: ['organization_id'],
      },
    )).toEqual([
      'candidate_workflow_email_queue.application_id',
      'candidate_workflow_email_queue.id',
      'org_settings.send_application_acknowledgement',
    ])
  })

  it('reports missing and mismatched bundled migrations before startup completes', async () => {
    const migrationModule = await import('../../server/plugins/migrations') as Record<string, unknown>
    const findMigrationLedgerDrift = migrationModule.findMigrationLedgerDrift as undefined | ((
      expected: Array<{ folderMillis: number, hash: string }>,
      actual: Array<{ createdAt: string, hash: string }>,
    ) => string[])

    expect(findMigrationLedgerDrift?.(
      [
        { folderMillis: 100, hash: 'first-hash' },
        { folderMillis: 200, hash: 'second-hash' },
        { folderMillis: 300, hash: 'third-hash' },
      ],
      [
        { createdAt: '100', hash: 'first-hash' },
        { createdAt: '200', hash: 'unexpected-hash' },
        { createdAt: '400', hash: 'future-hash' },
      ],
    )).toEqual([
      '200:hash-mismatch',
      '300:missing',
      '400:unexpected',
    ])
  })

  it('reports migration completion accurately when a non-production bootstrap skips SQL', async () => {
    const migrationModule = await import('../../server/plugins/migrations') as Record<string, unknown>
    const migrationCompletionSummary = migrationModule.migrationCompletionSummary as undefined | ((
      skipped: boolean,
    ) => { message: string, details: Record<string, boolean> })

    expect(migrationCompletionSummary?.(true)).toEqual({
      message: 'Runtime database schema verified; schema migrations were skipped',
      details: {
        schema_migrations_skipped: true,
        schema_verified: true,
      },
    })
  })

  it('validates before backfill, validates again, and marks encrypted storage ready', async () => {
    const calls: string[] = []

    await prepareSsoProviderSecretStorage({
      client: 'reserved-client' as never,
      secret: 'a'.repeat(32),
      mode: 'encrypted',
      validate: async () => {
        calls.push('validate')
        return { scanned: 1, plaintext: 0, encrypted: 1, withoutClientSecret: 0 }
      },
      backfill: async () => {
        calls.push('backfill')
        return { scanned: 1, encrypted: 0, alreadyEncrypted: 1, withoutClientSecret: 0 }
      },
      markReady: () => calls.push('ready'),
      markFailed: () => calls.push('failed'),
    })

    expect(calls).toEqual(['validate', 'backfill', 'validate', 'ready'])
  })

  it('does not mutate compatibility storage and fails before backfill on invalid data', async () => {
    const calls: string[] = []

    await expect(prepareSsoProviderSecretStorage({
      client: 'reserved-client' as never,
      secret: 'a'.repeat(32),
      mode: 'compatibility',
      validate: async () => {
        calls.push('validate')
        throw new Error('invalid storage')
      },
      backfill: async () => {
        calls.push('backfill')
        return { scanned: 0, encrypted: 0, alreadyEncrypted: 0, withoutClientSecret: 0 }
      },
      markReady: () => calls.push('ready'),
      markFailed: () => calls.push('failed'),
    })).rejects.toThrow('invalid storage')

    expect(calls).toEqual(['validate', 'failed'])
  })

  it('waits for the advisory lock and keeps migrate, unlock, and close on one reserved session', async () => {
    const client = { name: 'reserved-client' }
    const database = { name: 'reserved-database' }
    const calls: string[] = []

    await runMigrationsOnSession({
      databaseUrl: 'postgres://factory-careers.test/database',
      createClient: (databaseUrl, options) => {
        expect(databaseUrl).toBe('postgres://factory-careers.test/database')
        expect(options).toEqual({ max: 1 })
        calls.push('create-client')
        return client
      },
      createDatabase: (receivedClient) => {
        expect(receivedClient).toBe(client)
        calls.push('create-database')
        return database
      },
      execute: async (receivedDatabase, statement) => {
        expect(receivedDatabase).toBe(database)
        calls.push(statement)
      },
      migrate: async (receivedDatabase) => {
        expect(receivedDatabase).toBe(database)
        calls.push('migrate')
      },
      close: async (receivedClient) => {
        expect(receivedClient).toBe(client)
        calls.push('close')
      },
    })

    expect(calls).toEqual([
      'create-client',
      'create-database',
      'SELECT pg_advisory_lock(123456789)',
      'SET client_min_messages TO warning',
      'migrate',
      'SET client_min_messages TO notice',
      'SELECT pg_advisory_unlock(123456789)',
      'close',
    ])
    expect(calls.some(call => call.includes('pg_try_advisory_lock'))).toBe(false)
  })

  it('releases the advisory lock and closes the reserved client when migration fails', async () => {
    const calls: string[] = []

    await expect(runMigrationsOnSession({
      databaseUrl: 'postgres://factory-careers.test/database',
      createClient: () => 'reserved-client',
      createDatabase: () => 'reserved-database',
      execute: async (_database, statement) => {
        calls.push(statement)
      },
      migrate: async () => {
        calls.push('migrate')
        throw new Error('migration failed')
      },
      close: async () => {
        calls.push('close')
      },
    })).rejects.toThrow('migration failed')

    expect(calls).toEqual([
      'SELECT pg_advisory_lock(123456789)',
      'SET client_min_messages TO warning',
      'migrate',
      'SELECT pg_advisory_unlock(123456789)',
      'close',
    ])
  })

  it('closes the reserved client without unlocking when lock acquisition fails', async () => {
    const calls: string[] = []

    await expect(runMigrationsOnSession({
      databaseUrl: 'postgres://factory-careers.test/database',
      createClient: () => 'reserved-client',
      createDatabase: () => 'reserved-database',
      execute: async (_database, statement) => {
        calls.push(statement)
        if (statement.includes('pg_advisory_lock')) {
          throw new Error('database unavailable')
        }
      },
      migrate: async () => {
        calls.push('migrate')
      },
      close: async () => {
        calls.push('close')
      },
    })).rejects.toThrow('database unavailable')

    expect(calls).toEqual([
      'SELECT pg_advisory_lock(123456789)',
      'close',
    ])
  })
})
