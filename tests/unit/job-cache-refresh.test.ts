import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { jobsListKey } from '../../app/composables/useJobs'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

const LEGACY_JOBS_CACHE_KEYS = ['sidebar-jobs-list', 'application-link-job-list', 'source-tracking-jobs', 'chatbot-jobs']

describe('job cache refresh', () => {
  it('uses a canonical jobsListKey for equivalent queries', () => {
    expect(jobsListKey({})).toBe('jobs-{}')
    expect(jobsListKey({ limit: 100 })).toBe('jobs-{"limit":100}')
    expect(jobsListKey({ status: 'open' })).toBe('jobs-{"status":"open"}')
    expect(jobsListKey({ limit: 100, status: 'open' })).toBe('jobs-{"limit":100,"status":"open"}')
    expect(jobsListKey({})).toBe(jobsListKey({}))
    expect(jobsListKey({ limit: 100 })).toBe(jobsListKey({ limit: 100 }))
  })

  it('routes topbar jobs through useJobs with the canonical key helper', () => {
    const topbar = readProjectFile('app/components/AppTopBar.vue')
    const useJobsSource = readProjectFile('app/composables/useJobs.ts')

    expect(topbar).toContain('useSidebarJobs')
    expect(topbar).toContain('activeJobDetail')
    expect(topbar).toMatch(/job-\$\{activeJobId\.value\}/)
    expect(topbar).not.toContain('sidebar-jobs-list')
    expect(useJobsSource).toContain('export function jobsListKey')
    expect(useJobsSource).toMatch(/key:\s*computed\(\(\)\s*=>\s*jobsListKey/)
  })

  it('patches canonical jobs list caches after job mutations', () => {
    const useJob = readProjectFile('app/composables/useJob.ts')

    expect(useJob).toContain('patchJobsListCaches')
    expect(useJob).toContain('syncJobListCache')
    expect(useJob).toContain('refreshJobsListCaches')
    expect(useJob).not.toContain('sidebar-jobs-list')
  })

  it('does not keep legacy ad-hoc /api/jobs cache keys in dashboard consumers', () => {
    const consumers = [
      'app/components/AppTopBar.vue',
      'app/components/ApplicationLinkModal.vue',
      'app/pages/dashboard/source-tracking/index.vue',
      'app/pages/dashboard/chatbot/[[id]].vue',
    ]

    for (const file of consumers) {
      const source = readProjectFile(file)
      for (const legacyKey of LEGACY_JOBS_CACHE_KEYS) {
        expect(source, file).not.toContain(legacyKey)
      }
      expect(source, file).toMatch(/useJobs|useSidebarJobs/)
    }
  })
})