import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deleteDocumentWithProcessingHistory,
  type DocumentDeletionAdapter,
} from '../../server/utils/documentDeletion'

describe('document deletion with processing history', () => {
  it('has a reusable transactional deletion utility', () => {
    expect(existsSync(join(process.cwd(), 'server/utils/documentDeletion.ts'))).toBe(true)
  })

  it('returns only the relational deletion result after the durable enqueue transaction', async () => {
    const events: string[] = []
    const adapter: DocumentDeletionAdapter = {
      async deleteRelationalRecord(input) {
        expect(input).toEqual({ organizationId: 'org-1', documentId: 'document-1' })
        events.push('enqueue-and-delete')
        return { id: 'document-1' }
      },
    }

    const deleted = await deleteDocumentWithProcessingHistory({
      organizationId: 'org-1', documentId: 'document-1',
    }, adapter)
    expect(deleted?.id).toBe('document-1')
    expect(deleted).toEqual({ id: 'document-1' })
    expect(events).toEqual(['enqueue-and-delete'])
  })

  it('does not touch storage when the tenant-scoped document is absent', async () => {
    const events: string[] = []
    const adapter: DocumentDeletionAdapter = {
      async deleteRelationalRecord() {
        events.push('queue-and-database')
        return null
      },
    }

    await expect(deleteDocumentWithProcessingHistory({
      organizationId: 'org-1', documentId: 'missing-document',
    }, adapter)).resolves.toBeNull()
    expect(events).toEqual(['queue-and-database'])
  })

  it('routes normal deletion through atomic durable enqueue without storage cleanup', () => {
    const route = readFileSync(
      join(process.cwd(), 'server/api/documents/[id].delete.ts'),
      'utf8',
    )
    const helper = readFileSync(
      join(process.cwd(), 'server/utils/documentDeletion.ts'),
      'utf8',
    )
    expect(route).toContain('deleteDocumentWithProcessingHistory')
    expect(route).not.toContain('deleteFromS3(')
    expect(route).not.toContain('db.delete(document)')
    expect(helper).toContain(
      'export async function deleteDocumentRelationalRecordWithProcessingHistory',
    )
    const relationalDeletion = helper.slice(
      helper.indexOf('export async function deleteDocumentRelationalRecordWithProcessingHistory'),
      helper.indexOf('const defaultAdapter'),
    )
    expect(relationalDeletion.indexOf('cancelDocumentProcessingTasksInTransaction'))
      .toBeLessThan(relationalDeletion.indexOf(".for('update')"))
    expect(relationalDeletion.indexOf('cancelDocumentProcessingTasksInTransaction'))
      .toBeLessThan(relationalDeletion.indexOf('tx.delete(document)'))
    expect(relationalDeletion.indexOf('enqueueDocumentErasure'))
      .toBeLessThan(relationalDeletion.indexOf('tx.delete(document)'))
    expect(helper).not.toContain('deleteStorageObject')
    expect(helper).not.toContain('deleteFromS3')
    expect(helper).not.toContain('storage_key:')
    expect(helper).not.toContain('error_message:')
    expect(helper).not.toContain('storage_cleanup_failed')
  })
})
