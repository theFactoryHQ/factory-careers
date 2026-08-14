import { getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import * as schema from '../database/schema'

interface ApplicationRoleAccess {
  role: {
    superuser: boolean
    createDatabase: boolean
    createRole: boolean
    createInPublic: boolean
    connect?: boolean
    usePublic?: boolean
  }
  missingTablePrivileges: string[]
  missingSequencePrivileges: string[]
}

export function findApplicationRoleAccessFailures(input: ApplicationRoleAccess): string[] {
  const failures: string[] = []
  if (input.role.superuser) failures.push('application role must not be a superuser')
  if (input.role.createDatabase) failures.push('application role must not create databases')
  if (input.role.createRole) failures.push('application role must not create roles')
  if (input.role.createInPublic) failures.push('application role must not create objects in public schema')
  if (input.role.connect === false) failures.push('application role must connect to the application database')
  if (input.role.usePublic === false) failures.push('application role must use the public schema')
  if (input.missingTablePrivileges.length > 0) {
    failures.push(`missing table privileges: ${input.missingTablePrivileges.join(', ')}`)
  }
  if (input.missingSequencePrivileges.length > 0) {
    failures.push(`missing sequence privileges: ${input.missingSequencePrivileges.join(', ')}`)
  }
  return failures
}

export async function assertApplicationDatabaseReady(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 })
  try {
    const [role] = await client<{
      superuser: boolean
      create_database: boolean
      create_role: boolean
      create_in_public: boolean
      can_connect: boolean
      can_use_public: boolean
    }[]>`
      SELECT
        r.rolsuper AS superuser,
        r.rolcreatedb AS create_database,
        r.rolcreaterole AS create_role,
        has_schema_privilege(current_user, 'public', 'CREATE') AS create_in_public,
        has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
        has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public
      FROM pg_roles r
      WHERE r.rolname = current_user
    `
    if (!role) throw new Error('Application database role could not be inspected')

    const runtimeTables = new Set(
      Object.values(schema).filter(value => is(value, PgTable)).map(value => getTableName(value as PgTable)),
    )
    const tableRows = await client<{
      table_name: string
      can_select: boolean
      can_insert: boolean
      can_update: boolean
      can_delete: boolean
    }[]>`
      SELECT
        table_name,
        has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'SELECT') AS can_select,
        has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'INSERT') AS can_insert,
        has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'UPDATE') AS can_update,
        has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'DELETE') AS can_delete
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    const tableByName = new Map(tableRows.map(row => [row.table_name, row]))
    const missingTablePrivileges = [...runtimeTables].flatMap((tableName) => {
      const row = tableByName.get(tableName)
      return (['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const)
        .filter(privilege => !row?.[`can_${privilege.toLowerCase()}` as keyof typeof row])
        .map(privilege => `${tableName}:${privilege}`)
    })

    const sequenceRows = await client<{
      sequence_name: string
      can_usage: boolean
      can_select: boolean
      can_update: boolean
    }[]>`
      SELECT
        sequence_name,
        has_sequence_privilege(current_user, format('%I.%I', sequence_schema, sequence_name), 'USAGE') AS can_usage,
        has_sequence_privilege(current_user, format('%I.%I', sequence_schema, sequence_name), 'SELECT') AS can_select,
        has_sequence_privilege(current_user, format('%I.%I', sequence_schema, sequence_name), 'UPDATE') AS can_update
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
    `
    const missingSequencePrivileges = sequenceRows.flatMap(row =>
      (['USAGE', 'SELECT', 'UPDATE'] as const)
        .filter(privilege => !row[`can_${privilege.toLowerCase()}` as keyof typeof row])
        .map(privilege => `${row.sequence_name}:${privilege}`),
    )

    const failures = findApplicationRoleAccessFailures({
      role: {
        superuser: role.superuser,
        createDatabase: role.create_database,
        createRole: role.create_role,
        createInPublic: role.create_in_public,
        connect: role.can_connect,
        usePublic: role.can_use_public,
      },
      missingTablePrivileges,
      missingSequencePrivileges,
    })
    if (failures.length > 0) throw new Error(`Application database role is not ready: ${failures.join('; ')}`)
  }
  finally {
    await client.end({ timeout: 5 })
  }
}
