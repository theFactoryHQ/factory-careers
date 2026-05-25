import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('SSO settings page', () => {
  it('renders callback URLs through the SSR-safe site origin helper', () => {
    const source = readProjectFile('app/pages/dashboard/settings/sso.vue')
    const getCallbackUrl = source.match(/function getCallbackUrl\(providerId: string\) \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(getCallbackUrl).toContain('siteOrigin.value')
    expect(getCallbackUrl).not.toContain('window.location')
  })

  it('formats the quick setup guide as a padded help panel', () => {
    const source = readProjectFile('app/pages/dashboard/settings/sso.vue')
    const setupGuide = source.match(/<!-- Setup guide -->[\s\S]*?<\/div>\n\s*<\/div>\n\s*<\/Transition>/)?.[0] ?? ''

    expect(setupGuide).toContain('mx-4 mb-4 border border-white/10 bg-white/[0.025] p-4')
    expect(setupGuide).toContain('grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3')
    expect(setupGuide).toContain('block overflow-x-auto border border-white/10 bg-black')
    expect(setupGuide).toContain('border-t border-white/10 pt-4')
    expect(setupGuide).not.toContain('ui-panel-divider mt-6 pt-4')
    expect(setupGuide).not.toContain('list-inside')
  })
})
