import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('auth session deduplication', () => {
  const dashboardShellFiles = [
    'app/layouts/dashboard.vue',
    'app/layouts/settings.vue',
    'app/components/AppTopBar.vue',
    'app/composables/usePostHogIdentity.ts',
  ]

  it('routes dashboard shell session reads through useAuthSession', () => {
    for (const file of dashboardShellFiles) {
      const source = readProjectFile(file)

      expect(source, file).toContain('useAuthSession')
      expect(source, file).not.toContain('authClient.useSession(useFetch)')
    }
  })

  it('keeps useFetch-integrated session ownership in useAuthSession', () => {
    const source = readProjectFile('app/composables/useAuthSession.ts')

    expect(source).toContain('authClient.useSession(useFetch)')
    expect(source).toContain('export async function useAuthSession')
  })
})