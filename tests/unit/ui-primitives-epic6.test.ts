import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('Epic 6 UI primitives', () => {
  it('extracts ChatbotPickerMenu and migrates agent/model pickers', () => {
    const base = readProjectFile('app/components/ChatbotPickerMenu.vue')
    const agentPicker = readProjectFile('app/components/ChatbotAgentPicker.vue')
    const modelPicker = readProjectFile('app/components/ChatbotModelPicker.vue')

    expect(base).toContain('useMenuButton')
    expect(base).toContain('useFloatingMenu')
    expect(base).toContain('useOutsidePointer')
    expect(base).toContain('menu.onTriggerKeydown')
    expect(base).toContain('menu.onMenuKeydown')
    expect(base).toContain('defineExpose({ closeMenu })')

    expect(agentPicker).toContain('<ChatbotPickerMenu')
    expect(agentPicker).not.toContain('useMenuButton')
    expect(agentPicker).not.toContain('useFloatingMenu')

    expect(modelPicker).toContain('<ChatbotPickerMenu')
    expect(modelPicker).not.toContain('useMenuButton')
    expect(modelPicker).toContain('scrollable')
  })

  it('extracts shared settings navigation config', () => {
    const config = readProjectFile('app/config/settings-nav.ts')
    const sidebar = readProjectFile('app/components/SettingsSidebar.vue')
    const mobileNav = readProjectFile('app/components/SettingsMobileNav.vue')

    expect(config).toContain('export const settingsNavItems')
    expect(config).toContain('/dashboard/settings/privacy-requests')
    expect(config).toContain('filterVisibleSettingsNav')

    expect(sidebar).toContain("from '~/config/settings-nav'")
    expect(sidebar).toContain('filterVisibleSettingsNav(settingsNavItems, languageFeatureEnabled)')
    expect(sidebar).not.toContain('const settingsNav = [')

    expect(mobileNav).toContain("from '~/config/settings-nav'")
    expect(mobileNav).toContain('settingsNavMobileLabel(item)')
    expect(mobileNav).not.toContain('const settingsNav = [')
  })

  it('extracts useEmailTemplateForm for template editor pages', () => {
    const composable = readProjectFile('app/composables/useEmailTemplateForm.ts')
    const newPage = readProjectFile('app/pages/dashboard/emails/templates/new.vue')
    const editPage = readProjectFile('app/pages/dashboard/emails/templates/[id].vue')

    expect(composable).toContain('export function useEmailTemplateForm')
    expect(composable).toContain('EMAIL_TEMPLATE_SAMPLE_VARIABLES')
    expect(composable).toContain('renderTemplatePreview')
    expect(composable).toContain('loadFromSource')
    expect(composable).toContain('isDirtyComparedTo')

    expect(newPage).toContain('useEmailTemplateForm()')
    expect(newPage).not.toContain('const sampleVariables')
    expect(newPage).not.toContain('const purposeOptions = [')

    expect(editPage).toContain('useEmailTemplateForm()')
    expect(editPage).toContain('loadFromSource(source)')
    expect(editPage).not.toContain('const sampleVariables')
  })

  it('extracts useCopyToClipboard for copy affordances', () => {
    const composable = readProjectFile('app/composables/useCopyToClipboard.ts')
    const copyField = readProjectFile('app/components/CopyField.vue')
    const copyEmail = readProjectFile('app/components/CopyEmailButton.vue')

    expect(composable).toContain('export function useCopyToClipboard')
    expect(composable).toContain('navigator.clipboard.writeText')
    expect(composable).toContain("document.execCommand('copy')")

    expect(copyField).toContain('useCopyToClipboard()')
    expect(copyField).not.toContain('navigator.clipboard.writeText')

    expect(copyEmail).toContain('useCopyToClipboard({ useFallback: true })')
    expect(copyEmail).not.toContain('navigator.clipboard.writeText')
    expect(copyEmail).not.toContain("document.execCommand('copy')")
  })
})