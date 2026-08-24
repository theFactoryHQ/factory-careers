import { sql } from 'drizzle-orm'
import type { MigrationConfig } from 'drizzle-orm/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * Apply each journal entry in its own transaction.
 *
 * Drizzle's PostgreSQL migrator normally wraps every pending entry in one
 * transaction. A deferred trigger fired by one migration can therefore block
 * DDL against the same table in a later migration. Per-entry transactions
 * preserve atomic migrations and let deferred work settle at each boundary.
 */
export async function migrateDatabase<TSchema extends Record<string, unknown>>(
  database: PostgresJsDatabase<TSchema>,
  config: MigrationConfig,
): Promise<void> {
  const migrationsSchema = config.migrationsSchema ?? 'drizzle'
  const migrationsTable = config.migrationsTable ?? '__drizzle_migrations'

  await database.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`)
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)

  const applied = await database.execute<{ createdAt: string }>(sql`
    SELECT created_at::text AS "createdAt"
    FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
    ORDER BY created_at DESC
    LIMIT 1
  `)
  const lastAppliedAt = applied[0] ? Number(applied[0].createdAt) : undefined

  for (const migration of readMigrationFiles(config)) {
    if (lastAppliedAt !== undefined && lastAppliedAt >= migration.folderMillis) continue

    await database.transaction(async (tx) => {
      for (const statement of migration.sql) {
        await tx.execute(sql.raw(statement))
      }
      await tx.execute(sql`
        INSERT INTO ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}
          ("hash", "created_at")
        VALUES (${migration.hash}, ${migration.folderMillis})
      `)
    })
  }
}
