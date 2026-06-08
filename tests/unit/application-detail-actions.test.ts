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
    const surfaceComposable = readProjectFile('app/composables/useApplicationDetailSurface.ts')

    expect(surfaceComposable).toContain('useApplicationStatusActions')
    expect(surfaceComposable).toContain('useEditableApplicationNotes')

    for (const path of applicationDetailSurfaces) {
      const source = readProjectFile(path)
      const usesSharedSurface = path !== 'app/components/CandidateDetailSidebar.vue'

      if (usesSharedSurface) {
        expect(source, `${path} should use shared surface orchestration`).toContain('useApplicationDetailSurface')
      } else {
        expect(source, `${path} should use shared status actions`).toContain('useApplicationStatusActions')
        expect(source, `${path} should use shared editable notes`).toContain('useEditableApplicationNotes')
      }
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

  it('autosaves application notes instead of rendering manual save buttons', () => {
    const editableNotes = readProjectFile('app/composables/useEditableApplicationNotes.ts')
    const notesPanel = readProjectFile('app/components/ApplicationNotesPanel.vue')

    expect(editableNotes).toContain('autosaveNotes')
    expect(editableNotes).toContain('notesSaveStatus')
    expect(editableNotes).toContain('finishEditNotes')
    expect(editableNotes).toContain('queuedNotesSave')
    expect(editableNotes).toContain('activeNotesSave')
    expect(editableNotes).toContain('Save notes after typing stops')

    expect(notesPanel).toContain("emit('autosave')")
    expect(notesPanel).toContain("emit('finishEdit')")
    expect(notesPanel).toContain('notesSaveStatus')
    expect(notesPanel).not.toContain("{{ isSavingNotes ? 'Saving…' : 'Save' }}")

    for (const path of applicationDetailSurfaces) {
      const source = readProjectFile(path)

      expect(source, `${path} should render the shared notes panel`).toContain('<ApplicationNotesPanel')
      expect(source, `${path} should wire autosave through the shared panel`).toContain('@autosave="autosaveNotes"')
      expect(source, `${path} should save before closing note edit mode`).toContain('@finish-edit="finishEditNotes"')
      expect(source, `${path} should surface autosave status`).toContain('notesSaveStatus')
      expect(source, `${path} should not render the old manual notes save label`).not.toContain("{{ isSavingNotes ? 'Saving…' : 'Save' }}")
    }
  })
})
