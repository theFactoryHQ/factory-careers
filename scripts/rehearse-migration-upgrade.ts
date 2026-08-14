import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { PgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from '../server/database/schema'
import { assertApplicationDatabaseReady } from '../server/utils/applicationDatabaseReadiness'

const migrationsPath = 'server/database/migrations'

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).trim()
}

function databaseUrl(source: string, databaseName: string, username?: string, password?: string): string {
  const url = new URL(source)
  url.pathname = `/${databaseName}`
  if (username) url.username = username
  if (password) url.password = password
  return url.toString()
}

function materializeMigrations(ref: string, destination: string): void {
  const files = git(['ls-tree', '-r', '--name-only', ref, '--', migrationsPath])
    .split('\n')
    .filter(Boolean)

  if (files.length === 0) throw new Error(`No migrations found at ${ref}`)

  for (const file of files) {
    const relativePath = file.slice(`${migrationsPath}/`.length)
    const target = join(destination, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, execFileSync('git', ['show', `${ref}:${file}`]))
  }
}

function expectedColumns(): Map<string, Set<string>> {
  const expected = new Map<string, Set<string>>()
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    expected.set(getTableName(value), new Set(Object.values(getTableColumns(value)).map(column => column.name)))
  }
  return expected
}

async function main(): Promise<void> {
  const adminUrl = process.env.MIGRATION_UPGRADE_PG_URL
  const required = process.env.MIGRATION_UPGRADE_PG_REQUIRED === 'true'
  if (!adminUrl) {
    if (required) throw new Error('MIGRATION_UPGRADE_PG_URL is required')
    console.log('Migration upgrade rehearsal: SKIP (MIGRATION_UPGRADE_PG_URL is not set)')
    return
  }

  const requestedBase = process.env.MIGRATION_DISCIPLINE_BASE_REF || process.argv[2] || 'origin/main'
  const baseRef = git(['merge-base', requestedBase, 'HEAD'])
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'factory-careers-migration-upgrade-'))
  const baseMigrations = join(temporaryRoot, 'base')
  const databaseName = `factory_migration_${process.pid}_${randomBytes(4).toString('hex')}`
  const applicationRole = `factory_app_${process.pid}_${randomBytes(4).toString('hex')}`
  const applicationPassword = randomBytes(24).toString('hex')
  const admin = postgres(adminUrl, { max: 1 })
  let databaseCreated = false
  let applicationRoleCreated = false

  try {
    materializeMigrations(baseRef, baseMigrations)
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`)
    databaseCreated = true
    await admin.unsafe(`CREATE ROLE "${applicationRole}" LOGIN PASSWORD '${applicationPassword}'`)
    applicationRoleCreated = true
    await admin.unsafe(`GRANT CONNECT ON DATABASE "${databaseName}" TO "${applicationRole}"`)

    const client = postgres(databaseUrl(adminUrl, databaseName), { max: 1 })
    try {
      const db = drizzle(client, { schema })
      await migrate(db, { migrationsFolder: baseMigrations })
      await migrate(db, { migrationsFolder: migrationsPath })

      const ledger = await client<{ count: string }[]>`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`
      const bundledCount = readMigrationFiles({ migrationsFolder: migrationsPath }).length
      if (Number(ledger[0]?.count) !== bundledCount) {
        throw new Error(`Migration ledger has ${ledger[0]?.count ?? 0} rows; expected ${bundledCount}`)
      }

      const rows = await client<{ table_name: string, column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
      `
      const actual = new Map<string, Set<string>>()
      for (const row of rows) {
        const columns = actual.get(row.table_name) ?? new Set<string>()
        columns.add(row.column_name)
        actual.set(row.table_name, columns)
      }
      const missing = [...expectedColumns()].flatMap(([table, columns]) =>
        [...columns].filter(column => !actual.get(table)?.has(column)).map(column => `${table}.${column}`),
      )
      if (missing.length > 0) throw new Error(`Upgraded schema is missing modeled columns: ${missing.slice(0, 20).join(', ')}`)

      await client.unsafe(`GRANT USAGE ON SCHEMA public TO "${applicationRole}"`)
      await client.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${applicationRole}"`)
      await client.unsafe(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "${applicationRole}"`)
      const applicationUrl = databaseUrl(adminUrl, databaseName, applicationRole, applicationPassword)
      await assertApplicationDatabaseReady(applicationUrl)

      await client.unsafe(`REVOKE INSERT ON TABLE application FROM "${applicationRole}"`)
      let missingPrivilegeRejected = false
      try {
        await assertApplicationDatabaseReady(applicationUrl)
      }
      catch {
        missingPrivilegeRejected = true
      }
      if (!missingPrivilegeRejected) throw new Error('Application role rehearsal did not reject a missing INSERT privilege')

      await client.unsafe(`GRANT INSERT ON TABLE application TO "${applicationRole}"`)
      await client.unsafe('CREATE SEQUENCE readiness_unprivileged_sequence')
      let missingSequencePrivilegeRejected = false
      try {
        await assertApplicationDatabaseReady(applicationUrl)
      }
      catch {
        missingSequencePrivilegeRejected = true
      }
      if (!missingSequencePrivilegeRejected) {
        throw new Error('Application role rehearsal did not reject missing sequence privileges')
      }
    }
    finally {
      await client.end({ timeout: 5 })
    }

    console.log(`Migration upgrade rehearsal: PASS (${baseRef.slice(0, 7)} -> ${git(['rev-parse', '--short', 'HEAD'])})`)
  }
  finally {
    if (databaseCreated) await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
    if (applicationRoleCreated) await admin.unsafe(`DROP ROLE IF EXISTS "${applicationRole}"`)
    await admin.end({ timeout: 5 })
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`Migration upgrade rehearsal: FAIL (${error instanceof Error ? error.message : String(error)})`)
  process.exitCode = 1
})
