import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergeSanitizedColumnVisibility } from '../../app/composables/useColumnVisibility'
import { savedViewSettingsEqual } from '../../app/composables/useSavedViewState'

const ROOT = process.cwd()

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('dashboard list state helpers', () => {
  it('compares saved view settings without depending on object key order', () => {
    expect(savedViewSettingsEqual(
      {
        sortKey: 'created',
        sortDir: 'desc',
        visibleColumns: { email: true, job: false },
        propertyFilters: [{ field: 'stage', operator: 'eq', value: 'screening' }],
      },
      {
        propertyFilters: [{ operator: 'eq', value: 'screening', field: 'stage' }],
        visibleColumns: { job: false, email: true },
        sortDir: 'desc',
        sortKey: 'created',
      },
    )).toBe(true)
  })

  it('keeps saved view comparison deterministic for unsupported JSON values', () => {
    expect(savedViewSettingsEqual(
      { sortKey: 'created', filters: [undefined] },
      { sortKey: 'created', filters: [null] },
    )).toBe(false)

    expect(savedViewSettingsEqual(
      { sortKey: 'created', extra: undefined },
      { sortKey: 'created' },
    )).toBe(false)

    expect(savedViewSettingsEqual(
      { sortKey: 'created', marker: Symbol('a') },
      { sortKey: 'created', marker: Symbol('b') },
    )).toBe(false)
  })

  it('sanitizes localStorage column visibility before merging defaults', () => {
    const defaults = { email: true, phone: true }

    expect(mergeSanitizedColumnVisibility(defaults, ['email'])).toEqual(defaults)
    expect(mergeSanitizedColumnVisibility(defaults, {
      email: false,
      phone: 'nope',
      prop_custom: true,
      injected: false,
    })).toEqual({
      email: false,
      phone: true,
      prop_custom: true,
    })
  })

  it('moves repeated saved-view plumbing into a shared composable', () => {
    const helper = readProjectFile('app/composables/useSavedViewState.ts')
    const candidates = readProjectFile('app/pages/dashboard/candidates/index.vue')
    const applications = readProjectFile('app/pages/dashboard/applications/index.vue')
    const jobs = readProjectFile('app/pages/dashboard/jobs/index.vue')

    expect(helper).toContain('useSavedViews<T>(scope, defaultSettings)')
    expect(helper).toContain('onSelectView')
    expect(helper).toContain('onSaveView')
    expect(helper).toContain('onUpdateView')
    expect(candidates).toContain("useSavedViewState<CandidatesViewSettings>('candidates'")
    expect(applications).toContain("useSavedViewState<ApplicationsViewSettings>('applications'")
    expect(jobs).toContain("useSavedViewState<JobsViewSettings>('jobs'")

    for (const source of [candidates, applications, jobs]) {
      expect(source).not.toContain('function settingsEqual')
      expect(source).not.toContain('function onSelectView')
      expect(source).not.toContain('function onSaveView')
      expect(source).not.toContain('function onUpdateView')
    }
  })

  it('moves localStorage-backed column visibility into a shared composable', () => {
    const helper = readProjectFile('app/composables/useColumnVisibility.ts')
    const candidates = readProjectFile('app/pages/dashboard/candidates/index.vue')
    const applications = readProjectFile('app/pages/dashboard/applications/index.vue')

    expect(helper).toContain('reqcore:columns:${scope}')
    expect(candidates).toContain("useColumnVisibility('candidates', defaultColumnVisibility)")
    expect(applications).toContain("useColumnVisibility('applications', defaultColumnVisibility)")
    expect(candidates).not.toContain('COLUMNS_STORAGE_KEY')
    expect(applications).not.toContain('COLUMNS_STORAGE_KEY')
  })
})
