import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function projectPath(path: string) {
  return fileURLToPath(new URL(`../../${path}`, import.meta.url))
}

function readProjectFile(path: string) {
  return readFileSync(projectPath(path), 'utf-8')
}

function compactSource(source: string) {
  return source.replace(/\s+/g, ' ')
}

const applicationDetailSurfaces = [
  'app/components/ApplicationDetailDrawer.vue',
  'app/pages/dashboard/applications/[id].vue',
  'app/components/CandidateDetailSidebar.vue',
]

describe('application detail shared actions', () => {
  it('centralizes status transitions and editable notes in shared composables', () => {
    expect(existsSync(projectPath('app/composables/useApplicationStatusActions.ts'))).toBe(true)
    expect(existsSync(projectPath('app/composables/useEditableApplicationNotes.ts'))).toBe(true)
    expect(existsSync(projectPath('app/utils/application-response-format.ts'))).toBe(true)

    const statusActions = readProjectFile('app/composables/useApplicationStatusActions.ts')
    const editableNotes = readProjectFile('app/composables/useEditableApplicationNotes.ts')
    const responseFormat = readProjectFile('app/utils/application-response-format.ts')

    expect(statusActions).toContain('APPLICATION_STATUS_TRANSITIONS')
    expect(statusActions).toContain('allowedTransitions')
    expect(statusActions).toContain('isTransitioning')
    expect(statusActions).toContain('transitionToStatus')
    expect(statusActions).toContain('handlePreviewReadOnlyError')
    expect(statusActions).toContain('Failed to update status')

    expect(editableNotes).toContain('isEditingNotes')
    expect(editableNotes).toContain('notesInput')
    expect(editableNotes).toContain('isSavingNotes')
    expect(editableNotes).toContain('startEditNotes')
    expect(editableNotes).toContain('saveNotes')
    expect(editableNotes).toContain('handlePreviewReadOnlyError')
    expect(editableNotes).toContain('Failed to save notes')

    expect(responseFormat).toMatch(/export\s+function\s+formatResponseValue\s*\(\s*value\s*:\s*unknown\s*\)\s*:\s*string/)
    expect(responseFormat).toMatch(/Array\.isArray\s*\(\s*value\s*\)/)
    expect(compactSource(responseFormat)).toMatch(/typeof value === ['"]boolean['"].*value \? ['"]Yes['"] : ['"]No['"]/)
  })

  it('uses the shared composables on every application detail surface', () => {
    for (const path of applicationDetailSurfaces) {
      const source = readProjectFile(path)

      expect(source, `${path} should use shared status actions`).toContain('useApplicationStatusActions')
      expect(source, `${path} should use shared editable notes`).toContain('useEditableApplicationNotes')
      expect(source, `${path} should not define local status transitions`).not.toContain('APPLICATION_STATUS_TRANSITIONS')
      expect(source, `${path} should not define local transition state`).not.toContain('const isTransitioning = ref')
      expect(source, `${path} should not define local transition handler`).not.toContain('function handleTransition')
      expect(source, `${path} should not define local note editing state`).not.toContain('const isEditingNotes = ref')
      expect(source, `${path} should not define local note input state`).not.toContain('const notesInput = ref')
      expect(source, `${path} should not define local save handler`).not.toContain('function saveNotes')
      expect(source, `${path} should not define local response formatting`).not.toContain('function formatResponseValue(value')
      expect(source, `${path} should call the shared transition handler`).toMatch(/@click=["']transitionToStatus\([^)]*Status[^)]*\)["']/)
    }
  })
})
