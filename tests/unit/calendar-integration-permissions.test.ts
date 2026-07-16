import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('calendar integration organization permissions', () => {
  it('guards composable mutations with organization update permission', () => {
    const composable = read('app/composables/useCalendarIntegration.ts')

    expect(composable).toContain("usePermission({ organization: ['update'] })")
    expect(composable).toMatch(/function connect\(\)[\s\S]*?if \(!canManageCalendar\.value\) return/)
    expect(composable).toMatch(/async function disconnect\(\)[\s\S]*?if \(!canManageCalendar\.value\) return/)
  })

  it('does not render organization-wide connect or disconnect controls to ordinary members', () => {
    const page = read('app/pages/dashboard/settings/integrations.vue')

    expect(page).toContain('canManageCalendar')
    expect(page).toMatch(/v-if="!isAdminManagedCalendar && !isCalendarPermissionLoading && canManageCalendar"/)
    expect(page).toMatch(/v-if="!isMicrosoftAppMode && !isCalendarPermissionLoading && canManageCalendar"/)
    expect(page).toContain('Only organization administrators can change the shared calendar connection.')
  })
})
