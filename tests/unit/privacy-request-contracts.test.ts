import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildPrivacyRequestPublicResponse,
  hashPrivacyRequestToken,
} from '../../server/utils/privacyRequests'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('privacy request utilities', () => {
  it('hashes verification tokens without preserving the plaintext token', () => {
    const token = 'privacy-token-example'
    const hashed = hashPrivacyRequestToken(token)

    expect(hashed).toMatch(/^[a-f0-9]{64}$/)
    expect(hashed).not.toContain(token)
    expect(hashPrivacyRequestToken(token)).toBe(hashed)
    expect(hashPrivacyRequestToken(`${token}-2`)).not.toBe(hashed)
  })

  it('builds a generic public response that never reveals candidate matches', () => {
    expect(buildPrivacyRequestPublicResponse()).toEqual({
      success: true,
      message: 'If the details match our records, we will send a verification email with next steps.',
    })
  })
})

describe('privacy request source contracts', () => {
  it('declares the privacy request table, status enum, and migration', () => {
    const schema = read('server/database/schema/app.ts')
    const migration = read('server/database/migrations/0041_privacy_requests.sql')
    const journal = read('server/database/migrations/meta/_journal.json')

    expect(schema).toContain("export const privacyRequestStatusEnum = pgEnum('privacy_request_status'")
    expect(schema).toContain('export const privacyRequest = pgTable')
    expect(schema).toContain("verificationTokenHash: text('verification_token_hash')")
    expect(schema).toContain("status: privacyRequestStatusEnum('status')")
    expect(migration).toContain('CREATE TYPE "privacy_request_status"')
    expect(migration).toContain('CREATE TABLE "privacy_request"')
    expect(journal).toContain('0041_privacy_requests')
  })

  it('adds the public intake and verification surfaces', () => {
    const deleteRequestPage = read('app/pages/privacy/delete-request.vue')
    expect(deleteRequestPage).toContain('/api/privacy-requests')
    expect(deleteRequestPage).toContain('CCPA request form')
    expect(deleteRequestPage).toContain('Role or application context')
    expect(deleteRequestPage).not.toContain('Job slug')
    expect(read('server/api/privacy-requests/index.post.ts')).toContain('createPrivacyRequestSchema')
    expect(read('server/api/privacy-requests/index.post.ts')).toContain('Role or application context:')
    expect(read('server/api/privacy-requests/verify.get.ts')).toContain('verifyPrivacyRequestToken')
    expect(read('app/pages/privacy/index.vue')).toContain('/privacy/delete-request')
    expect(read('app/components/FactoryPublicFooter.vue')).toContain('/privacy/delete-request')
    expect(read('app/pages/privacy/index.vue')).toContain('California Consumer Privacy Act (CCPA)')
    expect(read('app/pages/privacy/index.vue')).toContain('mailto:legal@thefactoryhq.com')
    expect(read('app/components/FactoryLegalLayout.vue')).toContain('text-brand-500 underline decoration-brand-500')
  })

  it('adds authenticated owner/admin review and fulfillment routes', () => {
    for (const path of [
      'server/api/privacy-requests/index.get.ts',
      'server/api/privacy-requests/[id].get.ts',
      'server/api/privacy-requests/[id].patch.ts',
      'server/api/privacy-requests/[id]/fulfill.post.ts',
    ]) {
      const source = read(path)
      expect(source).toMatch(/requirePermission\(event, \{ privacyRequest: \['read'(?:, 'update')?\] \}\)/)
      expect(source).toContain('eq(privacyRequest.organizationId, orgId)')
    }

    expect(read('server/api/privacy-requests/[id]/fulfill.post.ts')).toContain('deleteCandidatePersonalDataForPrivacyRequest')
  })

  it('cleans polymorphic candidate and application data during privacy fulfillment', () => {
    const source = read('server/utils/privacyRequests.ts')

    expect(source).toContain("eq(comment.targetType, 'candidate')")
    expect(source).toContain("eq(comment.targetType, 'application')")
    expect(source).toContain("eq(propertyValue.entityType, 'candidate')")
    expect(source).toContain("eq(propertyValue.entityType, 'application')")
    expect(source).toContain('deleteFromS3(doc.storageKey)')
    expect(source).toContain('recordActivity')
  })

  it('adds permissions and settings navigation for privacy requests', () => {
    const permissions = read('shared/permissions.ts')
    const desktopNav = read('app/components/SettingsSidebar.vue')
    const mobileNav = read('app/components/SettingsMobileNav.vue')

    expect(permissions).toContain("privacyRequest: ['read', 'update']")
    expect(permissions).toContain("privacyRequest: []")
    expect(desktopNav).toContain('/dashboard/settings/privacy-requests')
    expect(mobileNav).toContain('/dashboard/settings/privacy-requests')
    expect(read('app/pages/dashboard/settings/privacy-requests.vue')).toContain('/api/privacy-requests')
  })
})
