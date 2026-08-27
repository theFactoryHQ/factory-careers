import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')

describe('retryable load errors and application field errors', () => {
  it('shares a load-error state that retries transient failures and keeps 404 copy', () => {
    const component = read('app/components/LoadErrorState.vue')
    const helper = read('app/utils/fetch-error.ts')

    expect(helper).toContain('export function isNotFoundFetchError')
    expect(helper).toContain('export function isRetryableFetchError')
    expect(component).toContain("variant?: 'hero' | 'banner'")
    expect(component).toContain('isNotFoundFetchError')
    expect(component).toContain('ui-alert-danger')
    expect(component).toContain('@click="emit(\'retry\')"')
    expect(component).toContain('notFoundTitle')
  })

  it('does not treat every public job and apply fetch failure as a missing position', () => {
    const jobDetail = read('app/pages/jobs/[slug]/index.vue')
    const apply = read('app/pages/jobs/[slug]/apply.vue')
    const jobsIndex = read('app/pages/jobs/index.vue')
    const interview = read('app/pages/interview/respond.vue')

    for (const source of [jobDetail, apply, jobsIndex, interview]) {
      expect(source).toContain('<LoadErrorState')
      expect(source).toContain('@retry="refresh()"')
    }

    expect(apply).toContain('not-found-title="Position Not Found"')
    expect(apply).toContain('failed-title="Couldn\'t load this position"')
    expect(jobDetail).toContain('not-found-title="Job Not Found"')
    expect(interview).toContain(':permanent-status-codes="[400]"')
  })

  it('adds Retry to dashboard detail and drawer load failures', () => {
    const pages = [
      'app/pages/dashboard/applications/[id].vue',
      'app/pages/dashboard/candidates/[id].vue',
      'app/pages/dashboard/interviews/[id].vue',
      'app/pages/dashboard/jobs/[id]/settings.vue',
      'app/pages/dashboard/jobs/[id]/application-form.vue',
      'app/pages/dashboard/jobs/[id]/ai-analysis.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
      'app/components/ApplicationDetailDrawer.vue',
      'app/components/CandidateDetailDrawer.vue',
    ]

    for (const path of pages) {
      const source = read(path)
      expect(source, path).toContain('<LoadErrorState')
      expect(source, path).toContain('@retry=')
    }

    expect(read('app/pages/dashboard/jobs/[id]/index.vue')).toContain('retryPipelineLoad')
    expect(read('app/pages/dashboard/jobs/[id]/candidates.vue')).toContain('retryCandidatesLoad')
  })

  it('associates public application validation errors with fields and focuses the first invalid control', () => {
    const apply = read('app/pages/jobs/[slug]/apply.vue')
    const dynamicField = read('app/components/DynamicField.vue')
    const factorySelect = read('app/components/FactorySelect.vue')

    expect(apply).toContain('focusFirstInvalidField')
    expect(apply).toContain(':aria-invalid="errors.firstName ? true : undefined"')
    expect(apply).toContain(':aria-describedby="errors.email ? fieldErrorId(\'email\') : undefined"')
    expect(apply).toContain(':invalid="!!errors.country"')
    expect(apply).toContain('formatApplicationSubmitError')
    expect(dynamicField).toContain(':aria-invalid="error ? true : undefined"')
    expect(dynamicField).toContain(':id="errorId"')
    expect(factorySelect).toContain('invalid?: boolean')
    expect(factorySelect).toContain(':aria-invalid="invalid ? true : undefined"')
    expect(factorySelect).toContain('v-bind="attrs"')
  })

  it('makes error toasts assertive and dismissible by name', () => {
    const toasts = read('app/components/AppToasts.vue')
    expect(toasts).toContain(":role=\"toast.type === 'error' ? 'alert' : 'status'\"")
    expect(toasts).toContain('aria-label="Dismiss notification"')
  })
})
