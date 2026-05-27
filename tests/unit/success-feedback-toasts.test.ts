import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('success feedback toasts', () => {
  it('uses toasts for transient action success messages instead of inline success banners', () => {
    const expectations = [
      {
        path: 'app/pages/dashboard/settings/account.vue',
        disallowed: ['profileSuccess'],
      },
      {
        path: 'app/pages/dashboard/settings/index.vue',
        disallowed: ['saveSuccess'],
      },
      {
        path: 'app/pages/dashboard/settings/localization.vue',
        disallowed: ['saveSuccess'],
      },
      {
        path: 'app/pages/dashboard/settings/sso.vue',
        disallowed: ['formSuccess', 'domainSaveSuccess'],
      },
      {
        path: 'app/pages/dashboard/settings/integrations.vue',
        disallowed: ['successMessage'],
      },
      {
        path: 'app/pages/dashboard/settings/members.vue',
        disallowed: ['inviteSuccess', 'resendSuccess', 'createLinkSuccess'],
      },
      {
        path: 'app/pages/dashboard/jobs/[id]/application-form.vue',
        disallowed: ['postingSaved', 'requirementsSaved', 'complianceSaved'],
      },
      {
        path: 'app/pages/dashboard/emails/templates/[id].vue',
        disallowed: ['saveSuccess'],
      },
      {
        path: 'app/pages/onboarding/create-org.vue',
        disallowed: ['requestSuccess'],
      },
    ]

    for (const { path, disallowed } of expectations) {
      const source = readProjectFile(path)

      expect(source, `${path} should use the toast composable`).toContain('useToast()')
      expect(source, `${path} should emit success toasts`).toContain('toast.success(')

      for (const token of disallowed) {
        expect(source, `${path} should not keep transient inline success state ${token}`).not.toContain(token)
      }
    }
  })
})
