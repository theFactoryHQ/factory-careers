import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/database/schema'
import {
  getDocumentErasureDedupeKey,
  getDocumentErasureFailureOutcome,
  getDocumentErasureResultCode,
  isMissingDocumentObject,
  sanitizeDocumentErasureResultCode,
} from '../../server/utils/documentErasureQueue'

describe('document erasure queue schema', () => {
  it('keeps durable work after organization deletion and constrains runnable attempts', () => {
    const table = schema.documentErasureQueue
    expect(table).toBeDefined()

    const config = getTableConfig(table!)
    const organizationId = config.columns.find(column => column.name === 'organization_id')
    const privacyRequestId = config.columns.find(column => column.name === 'privacy_request_id')
    const organizationForeignKey = config.foreignKeys.find(foreignKey =>
      foreignKey.reference().columns.some(column => column.name === 'organization_id'),
    )

    expect(organizationId?.notNull).toBe(false)
    expect(privacyRequestId?.notNull).toBe(false)
    expect(organizationForeignKey?.onDelete).toBe('set null')
    expect(config.indexes.map(index => index.config.name)).toEqual(expect.arrayContaining([
      'document_erasure_queue_dedupe_key_idx',
      'document_erasure_queue_runnable_idx',
    ]))
    expect(config.indexes.find(index => index.config.name === 'document_erasure_queue_dedupe_key_idx')?.config.unique)
      .toBe(true)
    expect(config.checks.map(check => check.name)).toEqual(expect.arrayContaining([
      'document_erasure_queue_attempts_check',
      'document_erasure_queue_state_check',
    ]))
  })

  it('attaches a privacy request to an existing unlinked tombstone on enqueue conflict', () => {
    const source = readFileSync(join(process.cwd(), 'server/utils/documentErasureQueue.ts'), 'utf8')
    const enqueue = source.slice(
      source.indexOf('export async function enqueueDocumentErasure'),
      source.indexOf('export async function claimDocumentErasures'),
    )

    expect(enqueue).toContain('onConflictDoUpdate')
    expect(enqueue).toContain('excluded.privacy_request_id')
    expect(enqueue).toContain('isNull(documentErasureQueue.privacyRequestId)')
    expect(enqueue).not.toContain('onConflictDoNothing')
  })
})

describe('document erasure queue helpers', () => {
  it('derives the same opaque dedupe key for every deletion path', () => {
    expect(getDocumentErasureDedupeKey('org/acme/document.pdf'))
      .toBe('document-erasure:cdc40927aa2144d95167e3cb5d124bc2')
  })

  it('classifies missing objects as successful erasure without exposing provider messages', () => {
    expect(isMissingDocumentObject({ name: 'NoSuchKey' })).toBe(true)
    expect(isMissingDocumentObject({ $metadata: { httpStatusCode: 404 } })).toBe(true)
    expect(isMissingDocumentObject({ statusCode: 404 })).toBe(true)
    expect(isMissingDocumentObject({ name: 'AccessDenied', statusCode: 403 })).toBe(false)

    const providerError = new Error('candidate@example.com at private/storage/key')
    providerError.name = 'ProviderTimeoutError'
    expect(getDocumentErasureResultCode(providerError)).toBe('storage_timeout')
    expect(getDocumentErasureResultCode({ name: 'AccessDenied', statusCode: 403 }))
      .toBe('storage_access_denied')
    expect(getDocumentErasureResultCode({ name: 'SlowDown', statusCode: 429 }))
      .toBe('storage_throttled')
    expect(getDocumentErasureResultCode({ name: 'ServiceUnavailable', statusCode: 503 }))
      .toBe('storage_unavailable')
    expect(getDocumentErasureResultCode({ message: 'candidate@example.com' }))
      .toBe('storage_error')
    expect(getDocumentErasureResultCode({ name: 'NoSuchKey' })).toBe('object_absent')
    expect(sanitizeDocumentErasureResultCode('candidate@example.com at private/key'))
      .toBe('storage_error')
    expect(sanitizeDocumentErasureResultCode('AliceApplicant'))
      .toBe('storage_error')
    expect(sanitizeDocumentErasureResultCode('candidate_email'))
      .toBe('storage_error')
    expect(sanitizeDocumentErasureResultCode('toString')).toBe('storage_error')
    expect(sanitizeDocumentErasureResultCode('__proto__')).toBe('storage_error')
    expect(sanitizeDocumentErasureResultCode('deleted')).toBe('erased')
    expect(sanitizeDocumentErasureResultCode('lease_expired')).toBe('lease_expired')
  })

  it('schedules bounded exponential retries and makes the final failure terminal', () => {
    const now = new Date('2026-08-23T12:00:00.000Z')
    expect(getDocumentErasureFailureOutcome({
      attemptCount: 1,
      maxAttempts: 10,
      now,
      resultCode: 'ProviderTimeoutError',
    })).toEqual({
      status: 'pending',
      availableAt: new Date('2026-08-23T12:01:00.000Z'),
      completedAt: null,
      resultCode: 'storage_timeout',
    })
    expect(getDocumentErasureFailureOutcome({
      attemptCount: 8,
      maxAttempts: 10,
      now,
      resultCode: 'ProviderTimeoutError',
    })?.availableAt).toEqual(new Date('2026-08-23T13:00:00.000Z'))
    expect(getDocumentErasureFailureOutcome({
      attemptCount: 10,
      maxAttempts: 10,
      now,
      resultCode: 'ProviderTimeoutError',
    })).toEqual({
      status: 'failed',
      availableAt: now,
      completedAt: now,
      resultCode: 'storage_timeout',
    })
  })
})
