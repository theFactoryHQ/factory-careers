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

  const useAuthSessionCallPattern = /await\s+useAuthSession\s*\(/
  const directSessionFetchPattern = /await\s+authClient\.useSession\s*\(\s*useFetch\s*\)/

  it('routes dashboard shell session reads through useAuthSession', () => {
    for (const file of dashboardShellFiles) {
      const source = readProjectFile(file)

      expect(source, file).toMatch(useAuthSessionCallPattern)
      expect(source, file).not.toMatch(directSessionFetchPattern)
    }
  })

  it('keeps useFetch-integrated session ownership in useAuthSession', () => {
    const source = readProjectFile('app/composables/useAuthSession.ts')

    expect(source).toMatch(directSessionFetchPattern)
    expect(source).toMatch(/export async function useAuthSession/)
  })
})