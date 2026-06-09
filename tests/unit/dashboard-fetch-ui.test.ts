import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computed, ref } from 'vue'
import { useStaleFetchUi } from '../../app/composables/useStaleFetchUi'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const MIGRATED_DASHBOARD_PAGES = [
  'app/pages/dashboard/index.vue',
  'app/pages/dashboard/jobs/index.vue',
  'app/pages/dashboard/candidates/index.vue',
  'app/pages/dashboard/applications/index.vue',
  'app/pages/dashboard/interviews/index.vue',
  'app/pages/dashboard/applications/[id].vue',
  'app/pages/dashboard/candidates/[id].vue',
  'app/pages/dashboard/interviews/[id].vue',
  'app/pages/dashboard/ai-analysis.vue',
  'app/pages/dashboard/source-tracking/[id].vue',
  'app/pages/dashboard/emails/templates/index.vue',
  'app/pages/dashboard/settings/sso.vue',
  'app/pages/dashboard/jobs/[id]/application-form.vue',
  'app/pages/dashboard/jobs/[id]/settings.vue',
]

describe('useStaleFetchUi', () => {
  it('shows skeleton only when pending without cached payload', () => {
    const fetchStatus = ref<'pending' | 'success'>('pending')
    const data = ref<unknown>(undefined)
    const { showSkeleton, isRevalidating } = useStaleFetchUi(fetchStatus, data)

    expect(showSkeleton.value).toBe(true)
    expect(isRevalidating.value).toBe(false)

    data.value = { data: [] }
    expect(showSkeleton.value).toBe(false)
    expect(isRevalidating.value).toBe(true)

    fetchStatus.value = 'success'
    expect(showSkeleton.value).toBe(false)
    expect(isRevalidating.value).toBe(false)
  })

  it('accepts computed data sources', () => {
    const fetchStatus = ref<'pending' | 'success'>('pending')
    const payload = ref({ id: '1' })
    const { showSkeleton } = useStaleFetchUi(fetchStatus, computed(() => payload.value))

    expect(showSkeleton.value).toBe(false)
  })
})

describe('dashboard stale fetch UI guards', () => {
  it('exports the shared stale fetch helper', () => {
    const helper = readProjectFile('app/composables/useStaleFetchUi.ts')
    expect(helper).toContain('showSkeleton')
    expect(helper).toContain('isRevalidating')
  })

  it.each(MIGRATED_DASHBOARD_PAGES)('%s uses showSkeleton instead of a full-page pending gate', (file) => {
    const source = readProjectFile(file)
    expect(source, file).toContain('useStaleFetchUi')
    expect(source, file).toContain('showSkeleton')
    expect(source, file).not.toMatch(/v-if\s*=\s*["'][^"']*\bfetchStatus\b[^"']*===\s*['"]pending['"]/)
    expect(source, file).not.toMatch(/v-if\s*=\s*["'][^"']*\bstatus\b[^"']*===\s*['"]pending['"]/)
  })
})