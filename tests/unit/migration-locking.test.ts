import { beforeAll, describe, expect, it, vi } from 'vitest'

type RunMigrationsOnSession = typeof import('../../server/plugins/migrations').runMigrationsOnSession

let runMigrationsOnSession: RunMigrationsOnSession

beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  ;({ runMigrationsOnSession } = await import('../../server/plugins/migrations'))
})

describe('runtime migration locking', () => {
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
