import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('application document association', () => {
  it('defines the nullable application foreign key, relations, index, and migration', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const migrationPath = join(process.cwd(), 'server/database/migrations/0051_application_documents.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(schema).toContain("applicationId: text('application_id').references(() => application.id, { onDelete: 'set null' })")
    expect(schema).toContain("index('document_application_id_idx').on(t.applicationId)")
    expect(schema).toContain('documents: many(document)')
    expect(schema).toContain('application: one(application, { fields: [document.applicationId], references: [application.id] })')

    expect(existsSync(migrationPath)).toBe(true)
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    expect(migration).toContain('ADD COLUMN "application_id" text')
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID')
    expect(migration).toContain('VALIDATE CONSTRAINT "document_application_id_application_id_fk"')
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'")
    expect(migration).toContain('CREATE INDEX "document_application_id_idx"')
    expect(journal).toContain('"tag": "0051_application_documents"')
  })

  it('associates built-in and custom public uploads with the new application', () => {
    const route = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')
    const transaction = readProjectFile('server/utils/createPublicApplication.ts')

    expect(route).toContain("kind: 'custom'")
    expect(route).toContain("kind: 'resume'")
    expect(route).toContain('documents: plannedDocumentUploads.map')
    expect(transaction).toContain('await tx.insertDocuments')
    expect(transaction).toContain('applicationId,')
    expect(transaction).toContain('...reservedDocument')
  })

  it('returns application documents through the existing candidate.documents contract with the analysis resume fallback', () => {
    const route = readProjectFile('server/api/applications/[id].get.ts')

    expect(route).toContain('applicationDocuments')
    expect(route).toContain('legacyCandidateDocuments')
    expect(route).toContain('eq(associatedDocument.organizationId, orgId)')
    expect(route).toContain('eq(legacyDocument.organizationId, orgId)')
    expect(route).toContain('isNull(legacyDocument.applicationId)')
    expect(route).toContain('desc(document.createdAt)')
    expect(route).toContain('selectApplicationDocumentsWithResumeFallback(')
    expect(route).toContain('documents: selectedDocuments')
  })
})
