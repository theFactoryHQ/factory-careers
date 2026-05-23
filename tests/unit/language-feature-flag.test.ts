import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../shared/feature-flags'
import {
  getEnabledI18nLocales,
  isLanguageFeatureEnabled,
} from '../../shared/language-feature'

const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('language feature flag', () => {
  it('registers language support as off by default', () => {
    const flags = FEATURE_FLAGS as Record<
      string,
      { defaultValue: boolean | string; description: string }
    >

    expect(flags['language-support']).toMatchObject({
      defaultValue: false,
    })
  })

  it('defaults to English-only locales until the env override enables languages', () => {
    expect(isLanguageFeatureEnabled({})).toBe(false)
    expect(getEnabledI18nLocales({}).map(locale => locale.code)).toEqual(['en'])

    const enabledEnv = { FEATURE_FLAG_LANGUAGE_SUPPORT: 'true' }
    expect(isLanguageFeatureEnabled(enabledEnv)).toBe(true)
    expect(getEnabledI18nLocales(enabledEnv).map(locale => locale.code)).toEqual([
      'en',
      'es',
      'fr',
      'de',
      'nb',
      'vi',
    ])
  })

  it('uses the language flag to limit Nuxt i18n to enabled locales', () => {
    const config = read('nuxt.config.ts')

    expect(config).toMatch(/const languageFeatureEnabled = isLanguageFeatureEnabled\(\)/)
    expect(config).toMatch(/locales:\s*enabledI18nLocales/)
    expect(config).toMatch(/detectBrowserLanguage:\s*languageFeatureEnabled\s*\?\s*\{/)
    expect(config).toMatch(/languageFeatureEnabled/)
    expect(config).not.toMatch(/locales:\s*i18nLocales/)
  })

  it('hides the language switcher when language support is disabled', () => {
    const switcher = read('app/components/LanguageSwitcher.vue')

    expect(switcher).toMatch(/languageFeatureEnabled/)
    expect(switcher).toMatch(/v-if="languageFeatureEnabled"/)
  })
})
