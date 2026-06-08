import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPropertyValue } from '../../app/utils/property-display'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('dashboard list epic 3 helpers', () => {
  it('reads property values from entity payloads', () => {
    expect(getPropertyValue({
      properties: [
        { definition: { id: 'prop_1' } as never, value: 'Senior' },
      ],
    }, 'prop_1')).toBe('Senior')

    expect(getPropertyValue({ properties: [] }, 'prop_1')).toBeNull()
  })

  it('keeps table sort helpers accessible and aria-aware', () => {
    const sortHelper = readProjectFile('app/composables/useTableSort.ts')

    for (const snippet of [
      'export function useTableSort',
      'toggleSort',
      'getSortAria',
      'getSortButtonLabel',
      "? 'ascending' : 'descending'",
    ]) {
      expect(sortHelper, snippet).toContain(snippet)
    }
  })

  it('routes candidates and applications list pages through shared epic 3 primitives', () => {
    const candidates = readProjectFile('app/pages/dashboard/candidates/index.vue')
    const applications = readProjectFile('app/pages/dashboard/applications/index.vue')

    for (const source of [candidates, applications]) {
      expect(source).toContain('<DashboardListToolbar')
      expect(source).toContain('useDashboardListPage')
      expect(source).toContain('useTableSort')
      expect(source).toContain("from '~/utils/property-display'")
      expect(source).not.toContain('let debounceTimer')
      expect(source).not.toContain('function getPropertyValue(')
    }
  })

  it('keeps shared toolbar and composable implementations grounded in repo files', () => {
    const toolbar = readProjectFile('app/components/DashboardListToolbar.vue')
    const listPage = readProjectFile('app/composables/useDashboardListPage.ts')
    const debounced = readProjectFile('app/composables/useDebouncedRef.ts')

    expect(toolbar).toContain('<GooeySearchInput')
    expect(toolbar).toContain('<SavedViewsMenu')
    expect(toolbar).toContain('<ColumnsMenu')
    expect(listPage).toContain('useDebouncedRef')
    expect(listPage).toContain("event.key === 'Escape'")
    expect(debounced).toContain('onScopeDispose')
  })
})