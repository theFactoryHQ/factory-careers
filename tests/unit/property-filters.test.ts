import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import { application, candidate } from '../../server/database/schema'
import {
  buildPropertyFiltersCondition,
  validatePropertyFilterDefinitions,
} from '../../server/utils/properties'
import { parsePropertyFiltersParam } from '../../server/utils/propertyFilters'

describe('property filter validation', () => {
  it('accepts isEmpty at the query-string boundary', () => {
    expect(parsePropertyFiltersParam(JSON.stringify([
      { propertyDefinitionId: 'candidate-note', op: 'isEmpty' },
    ]))).toEqual([
      { propertyDefinitionId: 'candidate-note', op: 'isEmpty' },
    ])
  })

  it('loads all distinct definitions once and rejects every invisible definition identically', async () => {
    const loader = vi.fn(async () => ['visible-global'])

    await expect(validatePropertyFilterDefinitions({
      organizationId: 'org-a',
      entityType: 'application',
      jobId: 'job-a',
      filters: [
        { propertyDefinitionId: 'visible-global', op: 'isNotEmpty' },
        { propertyDefinitionId: 'visible-global', op: 'equals', value: 0 },
      ],
    }, loader)).resolves.toBeUndefined()

    expect(loader).toHaveBeenCalledOnce()
    expect(loader).toHaveBeenCalledWith({
      organizationId: 'org-a',
      entityType: 'application',
      jobId: 'job-a',
      definitionIds: ['visible-global'],
    })

    for (const invisibleId of ['unknown', 'foreign-org', 'wrong-entity', 'wrong-job']) {
      await expect(validatePropertyFilterDefinitions({
        organizationId: 'org-a',
        entityType: 'application',
        jobId: 'job-a',
        filters: [
          { propertyDefinitionId: 'visible-global', op: 'isNotEmpty' },
          { propertyDefinitionId: invisibleId, op: 'isNotEmpty' },
        ],
      }, loader)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'Invalid propertyFilters',
      })
    }
  })
})

describe('property filter PostgreSQL predicates', () => {
  const dialect = new PgDialect()

  it('compiles correlated tenant-scoped EXISTS predicates with AND semantics', () => {
    const condition = buildPropertyFiltersCondition({
      organizationId: 'org-a',
      entityType: 'application',
      entityIdColumn: application.id,
      filters: [
        { propertyDefinitionId: 'text-def', op: 'contains', value: '100%_\\Path' },
        { propertyDefinitionId: 'checkbox-def', op: 'equals', value: false },
        { propertyDefinitionId: 'number-def', op: 'equals', value: 0 },
        { propertyDefinitionId: 'multi-def', op: 'in', value: ['red', 'blue'] },
      ],
    })
    const compiled = dialect.sqlToQuery(condition!)

    expect(compiled.sql.match(/exists \(/gi)).toHaveLength(4)
    expect(compiled.sql).toContain('"property_value"."entity_id" = "application"."id"')
    expect(compiled.sql).toContain('"property_value"."organization_id"')
    expect(compiled.sql).toContain('"property_value"."entity_type"')
    expect(compiled.sql).toContain("#>> '{}'")
    expect(compiled.sql).toContain("in ('string', 'number', 'boolean')")
    expect(compiled.sql).toMatch(/like .* escape '\\'/i)
    expect(compiled.sql).toContain('?|')
    expect(compiled.sql).toMatch(/\?\| array\[\$\d+, \$\d+\]::text\[\]/)
    expect(compiled.params).toContain('%100\\%\\_\\\\path%')
    expect(compiled.params).toContain('false')
    expect(compiled.params).toContain('0')
  })

  it('treats absent and all stored empty shapes as empty while preserving false and zero', () => {
    const empty = dialect.sqlToQuery(buildPropertyFiltersCondition({
      organizationId: 'org-a',
      entityType: 'candidate',
      entityIdColumn: candidate.id,
      filters: [{ propertyDefinitionId: 'empty-def', op: 'isEmpty' }],
    })!)
    const nonempty = dialect.sqlToQuery(buildPropertyFiltersCondition({
      organizationId: 'org-a',
      entityType: 'candidate',
      entityIdColumn: candidate.id,
      filters: [{ propertyDefinitionId: 'empty-def', op: 'isNotEmpty' }],
    })!)

    expect(empty.sql).toMatch(/^not exists \(/i)
    expect(nonempty.sql).toMatch(/^exists \(/i)
    for (const compiled of [empty.sql, nonempty.sql]) {
      expect(compiled).toContain('is not null')
      expect(compiled).toContain("jsonb_typeof(\"property_value\".\"value\") <> 'null'")
      expect(compiled).toContain("jsonb_typeof(\"property_value\".\"value\") = 'string'")
      expect(compiled).toContain("jsonb_typeof(\"property_value\".\"value\") = 'array'")
      expect(compiled).toContain('jsonb_array_length')
    }
  })
})
