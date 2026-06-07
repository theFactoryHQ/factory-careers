import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E recruiting fixtures', () => {
  it('exports shared recruiting API helpers', () => {
    const source = readProjectFile('e2e/helpers/recruiting-fixtures.ts')

    for (const exportName of [
      'createJob',
      'publishJob',
      'createCandidate',
      'createApplication',
      'updateApplicationStatus',
      'expectApiStatus',
      'DEFAULT_JOB_PAYLOAD',
    ]) {
      expect(source, exportName).toContain(exportName)
    }
  })

  it('is adopted by critical-flow specs with local seeding helpers', () => {
    const migratedSpecs = [
      'e2e/critical-flows/application-board.spec.ts',
      'e2e/critical-flows/activity-timeline.spec.ts',
      'e2e/critical-flows/candidate-documents.spec.ts',
      'e2e/critical-flows/application-custom-properties.spec.ts',
      'e2e/critical-flows/application-saved-views.spec.ts',
      'e2e/critical-flows/application-form-builder.spec.ts',
    ]

    for (const spec of migratedSpecs) {
      const source = readProjectFile(spec)
      expect(source, spec).toContain('../helpers/recruiting-fixtures')
      expect(source, spec).not.toContain('async function createJob(')
    }
  })
})