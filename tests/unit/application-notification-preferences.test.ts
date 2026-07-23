import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification preferences', () => {
  it('exposes self-service personal preferences and admin-only inbox settings', () => {
    const personalGet = read('server/api/notification-preferences/application-email.get.ts')
    const personalPut = read('server/api/notification-preferences/application-email.put.ts')
    const inboxGet = read('server/api/notification-settings/application-email.get.ts')
    const inboxPatch = read('server/api/notification-settings/application-email.patch.ts')

    expect(personalGet).toContain("requirePermission(event, { application: ['read'] })")
    expect(personalPut).toContain("requirePermission(event, { application: ['read'] })")
    expect(personalPut).toContain('applicationNotificationPreferenceSchema.parse')
    expect(inboxGet).toContain("requirePermission(event, { organization: ['update'] })")
    expect(inboxPatch).toContain("requirePermission(event, { organization: ['update'] })")
    expect(inboxPatch).toContain('hiringInboxNotificationSettingsSchema.parse')
  })

  it('keeps missing personal rows off and resolves the inbox to a weekly fallback', () => {
    const service = read('server/utils/applicationNotificationPreferences.ts')

    expect(service).toContain('DEFAULT_MEMBER_NOTIFICATION_PREFERENCE')
    expect(service).toContain('DEFAULT_HIRING_INBOX_NOTIFICATION_PREFERENCE')
    expect(service).toContain('env.FACTORY_CAREERS_HIRING_INBOX')
    expect(service).toContain("recipientKind: 'member'")
    expect(service).toContain("recipientKind: 'hiring_inbox'")
    expect(service).toContain("status: 'cancelled'")
    expect(service).toContain('eq(applicationNotificationDelivery.status, \'pending\')')
    expect(service).not.toContain("inArray(applicationNotificationDelivery.status, ['pending', 'processing'])")
    expect(service).toContain('memberId: membership.id')
    expect(service).toContain('normalizeHiringInboxRecipient')
  })
})
