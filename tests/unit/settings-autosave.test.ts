import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('settings autosave', () => {
  it('autosaves localization preference changes without a manual save button', () => {
    const source = readProjectFile('app/pages/dashboard/settings/localization.vue')

    expect(source).toContain('autosaveLocalizationSettings')
    expect(source).toContain('localizationSaveStatus')
    expect(source).toContain('@update:model-value="autosaveLocalizationSettings"')
    expect(source).toContain('Automatically saves changes')
    expect(source).not.toContain('Save changes')
  })
})
