import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification settings page', () => {
  it('offers personal controls to members and gates the inbox card to admins', () => {
    const page = read('app/pages/dashboard/settings/notifications.vue')
    const nav = read('app/config/settings-nav.ts')

    expect(nav).toContain("to: '/dashboard/settings/notifications'")
    expect(page).toContain("usePermission({ organization: ['update'] })")
    expect(page).toContain('Personal notifications')
    expect(page).toContain('Careers inbox')
    expect(page).toContain('v-if="canUpdateOrg"')
    expect(page).toContain('/api/notification-preferences/application-email')
    expect(page).toContain('/api/notification-settings/application-email')
  })

  it('uses accessible native schedule controls and previews the next delivery', () => {
    const page = read('app/pages/dashboard/settings/notifications.vue')

    expect(page).toContain('Per application')
    expect(page).toContain('Daily')
    expect(page).toContain('Weekly')
    expect(page).toContain('Monthly')
    expect(page).toContain('Off')
    expect(page).toContain('calculateNextApplicationNotificationDelivery')
    expect(page).toContain('type="time"')
    expect(page).toContain('type="number"')
    expect(page).toContain('<select')
    expect(page).toContain('Next delivery')
  })

  it('does not expose default forms after a settings request fails and offers retry actions', () => {
    const page = read('app/pages/dashboard/settings/notifications.vue')

    expect(page).toContain("personalStatus === 'error'")
    expect(page).toContain('refreshPersonal')
    expect(page).toContain("inboxStatus === 'error'")
    expect(page).toContain('loadInbox')
    expect(page).toContain('Unable to load')
  })
})
