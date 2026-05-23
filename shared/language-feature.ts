import type { LocaleObject } from '@nuxtjs/i18n'
import {
  FEATURE_FLAGS,
  flagEnvVarName,
  parseFlagOverride,
  type FeatureFlagKey,
} from './feature-flags'

export const LANGUAGE_FEATURE_FLAG = 'language-support' satisfies FeatureFlagKey
export const I18N_DEFAULT_LOCALE = 'en'

export type I18nLocale = LocaleObject<string> & {
  code: string
  language: string
  name: string
  file: string
  partial?: boolean
}

export const I18N_LOCALES: readonly I18nLocale[] = [
  { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
  {
    code: 'es',
    language: 'es-ES',
    name: 'Español',
    file: 'es.json',
    partial: true,
  },
  {
    code: 'fr',
    language: 'fr-FR',
    name: 'Français',
    file: 'fr.json',
    partial: true,
  },
  {
    code: 'de',
    language: 'de-DE',
    name: 'Deutsch',
    file: 'de.json',
    partial: true,
  },
  { code: 'nb', language: 'nb-NO', name: 'Norsk Bokmål', file: 'nb.json' },
  {
    code: 'vi',
    language: 'vi-VN',
    name: 'Tiếng Việt',
    file: 'vi.json',
    partial: true,
  },
]

export function isLanguageFeatureEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const override = parseFlagOverride(
    LANGUAGE_FEATURE_FLAG,
    env[flagEnvVarName(LANGUAGE_FEATURE_FLAG)],
  )
  const value = override ?? FEATURE_FLAGS[LANGUAGE_FEATURE_FLAG].defaultValue

  return value === true
}

export function getEnabledI18nLocales(
  env: Record<string, string | undefined> = process.env,
): I18nLocale[] {
  if (isLanguageFeatureEnabled(env)) return [...I18N_LOCALES]
  return I18N_LOCALES.filter(locale => locale.code === I18N_DEFAULT_LOCALE)
}
