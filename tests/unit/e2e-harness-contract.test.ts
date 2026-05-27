import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const emptyCatchPattern = /\.catch\s*\(\s*(?:\([^)]*\)|[$A-Z_a-z][$\w]*)\s*=>\s*\{\s*\}\s*\)/m
const e2eRequiredNeeds = 'needs: [smoke, security-core, security-extended, uploads, ui, candidate, recruiter, job_lifecycle, email, tracking_analytics, interviews, calendar, auth_org, rbac, sso, ai_review, production_session]'

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

function workflowJobBlock(workflow: string, jobId: string): string {
  const start = workflow.indexOf(`\n  ${jobId}:\n`)
  expect(start, `${jobId} job should be present`).toBeGreaterThanOrEqual(0)

  const nextJob = workflow.slice(start + 1).search(/\n  [a-zA-Z0-9_-]+:\n/)
  return nextJob === -1
    ? workflow.slice(start)
    : workflow.slice(start, start + 1 + nextJob)
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : []
  })
}

describe('Playwright E2E harness contract', () => {
  it('runs a fast critical smoke pack in CI instead of reporting a disabled success', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).not.toContain('temporarily disabled')
    expect(workflow).not.toContain('Real E2E execution is disabled')
    expect(workflow).toContain('npm run test:e2e:smoke')
    expect(workflow).toContain('FACTORY_DISABLE_PUBLIC_SIGNUP: "false"')
    expect(workflow).toContain('FACTORY_DISABLE_PUBLIC_ORG_CREATION: "false"')
    expect(workflow).toContain('DATABASE_URL:')
  })

  it('defines the smoke pack as the high-signal browser coverage only', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:smoke']).toBe(
      'playwright test e2e/critical-flows/dropdown-styling.spec.ts e2e/critical-flows/job-creation.spec.ts e2e/critical-flows/source-tracking.spec.ts',
    )
    expect(packageJson.scripts?.['test:e2e:smoke']).not.toContain('resume-upload')
    expect(packageJson.scripts?.['test:e2e:smoke']).not.toContain('tenant-isolation')
    expect(packageJson.scripts?.['test:e2e:smoke']).not.toContain('invitation-management')
  })

  it('defines layered security E2E scripts for PR core and extended surfaces', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:security:core']).toBe(
      'playwright test e2e/security/tenant-isolation.spec.ts --grep @security-core',
    )
    expect(packageJson.scripts?.['test:e2e:security:extended']).toBe(
      'FEATURE_FLAG_CHATBOT_EXPERIENCE=true playwright test e2e/security/tenant-isolation.spec.ts --grep @security-extended',
    )
  })

  it('defines a selectable UI-management E2E pack for invitation management', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:ui']).toBe(
      'playwright test e2e/critical-flows/invitation-management.spec.ts e2e/critical-flows/mobile-keyboard-smoke.spec.ts',
    )
  })

  it('runs invitation management browser coverage in a dedicated UI CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).toContain('name: Playwright UI')
    expect(workflow).toContain('npm run test:e2e:ui')
    expect(workflow).toContain(e2eRequiredNeeds)
    expect(workflow).toContain('needs.ui.result')
  })

  it('runs candidate application browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:candidate']).toBe(
      'playwright test e2e/critical-flows/candidate-application.spec.ts',
    )
    expect(workflow).toContain('name: Playwright candidate')
    expect(workflow).toContain('npm run test:e2e:candidate')
    expect(workflow).toContain('factory-careers-candidate-minio')
    expect(workflow).toContain('needs.candidate.result')
  })

  it('runs recruiter application lifecycle browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:recruiter']).toBe(
      'playwright test e2e/critical-flows/recruiter-application-lifecycle.spec.ts e2e/critical-flows/application-saved-views.spec.ts e2e/critical-flows/application-custom-properties.spec.ts e2e/critical-flows/candidate-custom-properties.spec.ts',
    )
    expect(workflow).toContain('name: Playwright recruiter')
    expect(workflow).toContain('npm run test:e2e:recruiter')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(workflow).toContain('needs.recruiter.result')
  })

  it('runs post-publish job lifecycle browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:job-lifecycle']).toBe(
      'playwright test e2e/critical-flows/job-lifecycle.spec.ts e2e/critical-flows/application-form-builder.spec.ts',
    )
    expect(workflow).toContain('name: Playwright job lifecycle')
    expect(workflow).toContain('npm run test:e2e:job-lifecycle')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(workflow).toContain('needs.job_lifecycle.result')
  })

  it('runs email-triggering browser coverage against a fake mail sink', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:email']).toBe(
      'playwright test e2e/critical-flows/fake-mail.spec.ts e2e/critical-flows/privacy-request-fake-mail.spec.ts e2e/critical-flows/auth-recovery-fake-mail.spec.ts --workers=1',
    )
    expect(workflow).toContain('name: Playwright email')
    expect(workflow).toContain('npm run test:e2e:email')
    expect(workflow).toContain('FACTORY_ADMIN_SSO_ONLY: "false"')
    expect(workflow).toContain('FACTORY_EMAIL_TEST_MODE: capture')
    expect(workflow).toContain('FACTORY_EMAIL_CAPTURE_PATH: /tmp/factory-careers-e2e-email.jsonl')
    expect(workflow).toContain('FACTORY_CAREERS_HIRING_INBOX: hiring-e2e@example.com')
    expect(workflow).toContain('FACTORY_CAREERS_PRIVACY_INBOX: privacy-e2e@example.com')
    expect(workflow).not.toContain('RESEND_API_KEY: ${{ secrets')
    expect(read('e2e/critical-flows/privacy-request-fake-mail.spec.ts')).toContain('FACTORY_EMAIL_TEST_MODE')
    expect(read('e2e/critical-flows/auth-recovery-fake-mail.spec.ts')).toContain('FACTORY_EMAIL_TEST_MODE')
    expect(workflow).toContain('needs.email.result')
  })

  it('runs tracking-link creation and analytics browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:tracking-analytics']).toBe(
      'playwright test e2e/critical-flows/tracking-analytics.spec.ts',
    )
    expect(workflow).toContain('name: Playwright tracking analytics')
    expect(workflow).toContain('npm run test:e2e:tracking-analytics')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(workflow).toContain('needs.tracking_analytics.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs interview scheduling lifecycle browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const interviewsJob = workflowJobBlock(workflow, 'interviews')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:interviews']).toBe(
      'playwright test e2e/critical-flows/interview-lifecycle.spec.ts e2e/critical-flows/interview-invitation-response.spec.ts e2e/critical-flows/interview-template-management.spec.ts --workers=1',
    )
    expect(interviewsJob).toContain('name: Playwright interviews')
    expect(interviewsJob).toContain('npm run test:e2e:interviews')
    expect(interviewsJob).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(interviewsJob).toContain('FACTORY_EMAIL_TEST_MODE: capture')
    expect(interviewsJob).toContain('FACTORY_EMAIL_CAPTURE_PATH: /tmp/factory-careers-e2e-interview-email.jsonl')
    expect(read('e2e/critical-flows/interview-invitation-response.spec.ts')).toContain('FACTORY_EMAIL_TEST_MODE')
    expect(read('e2e/critical-flows/interview-template-management.spec.ts')).toContain('FACTORY_EMAIL_TEST_MODE')
    expect(workflow).toContain('needs.interviews.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs calendar integration browser coverage against a deterministic mock provider', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const calendarJob = workflowJobBlock(workflow, 'calendar')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:calendar']).toBe(
      'FACTORY_CALENDAR_TEST_MODE=mock playwright test e2e/critical-flows/calendar-integration.spec.ts',
    )
    expect(calendarJob).toContain('name: Playwright calendar')
    expect(calendarJob).toContain('npm run test:e2e:calendar')
    expect(calendarJob).toContain('FACTORY_CALENDAR_TEST_MODE: mock')
    expect(calendarJob).not.toContain('GOOGLE_CLIENT_SECRET')
    expect(calendarJob).not.toContain('MICROSOFT_CALENDAR_CLIENT_SECRET')
    expect(read('e2e/critical-flows/calendar-integration.spec.ts')).toContain('FACTORY_CALENDAR_TEST_MODE')
    expect(workflow).toContain('needs.calendar.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs auth and organization edge-flow browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:auth-org']).toBe(
      'playwright test e2e/critical-flows/auth-org-edge-flows.spec.ts',
    )
    expect(workflow).toContain('name: Playwright auth and org')
    expect(workflow).toContain('npm run test:e2e:auth-org')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(workflow).toContain('needs.auth_org.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs role-permission browser coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:rbac']).toBe(
      'playwright test e2e/critical-flows/rbac-role-permissions.spec.ts',
    )
    expect(workflow).toContain('name: Playwright RBAC')
    expect(workflow).toContain('npm run test:e2e:rbac')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(workflow).toContain('needs.rbac.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs SSO domain provisioning browser coverage against local-only IdP origins', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:sso']).toBe(
      'playwright test e2e/critical-flows/sso-domain-provisioning.spec.ts',
    )
    expect(workflow).toContain('name: Playwright SSO')
    expect(workflow).toContain('npm run test:e2e:sso')
    expect(workflow).toContain('BETTER_AUTH_TRUSTED_ORIGINS: http://127.0.0.1:3333,http://127.0.0.1:3999')
    expect(workflow).toContain('E2E_SSO_MOCK_PORT: "3999"')
    expect(workflow).not.toContain('OIDC_CLIENT_SECRET: ${{ secrets')
    expect(workflow).toContain('needs.sso.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs AI candidate-review browser coverage against a deterministic mock provider', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:ai-review']).toBe(
      'playwright test e2e/critical-flows/ai-candidate-review.spec.ts e2e/critical-flows/ai-config-lifecycle.spec.ts --workers=1',
    )
    expect(workflow).toContain('name: Playwright AI review')
    expect(workflow).toContain('npm run test:e2e:ai-review')
    expect(workflow).toContain('FACTORY_AI_TEST_MODE: mock')
    expect(workflow).toContain('FACTORY_AI_CAPTURE_PATH: /tmp/factory-careers-e2e-ai.jsonl')
    expect(workflow).not.toContain('OPENAI_API_KEY: ${{ secrets')
    expect(read('e2e/critical-flows/ai-candidate-review.spec.ts')).toContain('FACTORY_AI_TEST_MODE')
    expect(read('e2e/critical-flows/ai-config-lifecycle.spec.ts')).toContain('FACTORY_AI_TEST_MODE')
    expect(workflow).toContain('needs.ai_review.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs resume upload browser coverage in a dedicated local-storage CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:uploads']).toBe(
      'playwright test e2e/critical-flows/resume-upload.spec.ts',
    )
    expect(workflow).toContain('name: Playwright uploads')
    expect(workflow).toContain('npm run test:e2e:uploads')
    expect(workflow).toContain('factory-careers-uploads-minio')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "false"')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('runs core tenant/document/RBAC security checks in CI', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const minioAction = read('.github/actions/start-minio/action.yml')

    expect(workflow).toContain('name: Playwright security core')
    expect(workflow).toContain('npm run test:e2e:security:core')
    expect(workflow).toContain('uses: ./.github/actions/start-minio')
    expect(minioAction).toContain('minio/minio:RELEASE.')
    expect(minioAction).not.toContain('default: minio/minio:latest')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "false"')
  })

  it('runs extended security checks in a separate CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).toContain('name: Playwright security extended')
    expect(workflow).toContain('FEATURE_FLAG_CHATBOT_EXPERIENCE: "true"')
    expect(workflow).toContain('npm run test:e2e:security:extended')
    expect(workflow).toContain('factory-careers-security-extended-minio')
    expect(workflow).toContain('needs.security-extended.result')
  })

  it('runs production-build session cache coverage in a dedicated CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['test:e2e:production-session']).toBe(
      'playwright test --config playwright.production.config.ts e2e/critical-flows/production-session-cache.spec.ts --workers=1',
    )
    expect(workflow).toContain('name: Playwright production session')
    expect(workflow).toContain('npm run test:e2e:production-session')
    expect(workflow).toContain('PLAYWRIGHT_BASE_URL: http://127.0.0.1:3334')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "true"')
    expect(read('playwright.production.config.ts')).toContain('node .output/server/index.mjs')
    expect(read('e2e/critical-flows/production-session-cache.spec.ts')).toContain('/api/dashboard/stats')
    expect(workflow).toContain('needs.production_session.result')
    expect(workflow).toContain(e2eRequiredNeeds)
  })

  it('keeps the branch-protection E2E status as an aggregate of the split jobs', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).toContain('name: Playwright E2E')
    expect(workflow).toContain(e2eRequiredNeeds)
    expect(workflow).toContain('needs.smoke.result')
    expect(workflow).toContain('needs.security-core.result')
    expect(workflow).toContain('needs.security-extended.result')
    expect(workflow).toContain('needs.uploads.result')
    expect(workflow).toContain('needs.ui.result')
    expect(workflow).toContain('needs.candidate.result')
    expect(workflow).toContain('needs.recruiter.result')
    expect(workflow).toContain('needs.job_lifecycle.result')
    expect(workflow).toContain('needs.email.result')
    expect(workflow).toContain('needs.tracking_analytics.result')
    expect(workflow).toContain('needs.interviews.result')
    expect(workflow).toContain('needs.auth_org.result')
    expect(workflow).toContain('needs.rbac.result')
    expect(workflow).toContain('needs.sso.result')
    expect(workflow).toContain('needs.production_session.result')
  })

  it('keeps Playwright parallel-ready for independent smoke specs', () => {
    const config = read('playwright.config.ts')

    expect(config).toContain('fullyParallel: true')
    expect(config).toContain('workers: process.env.CI ? 2 : undefined')
    expect(config).toContain('trace: process.env.CI ?')
    expect(config).toContain('FEATURE_FLAG_CHATBOT_EXPERIENCE=true')
    expect(config).toContain("const ssoMockPort = process.env.E2E_SSO_MOCK_PORT ?? '3999'")
    expect(config).toContain('BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3333,http://127.0.0.1:${ssoMockPort}')
    expect(config).toContain('E2E_SSO_MOCK_PORT=${ssoMockPort}')
    expect(config).not.toContain('tests share state')
  })

  it('does not swallow e2e publish response failures', () => {
    const unsafeFiles = walk(join(root, 'e2e'))
      .filter(path => /\.spec\.ts$/.test(path))
      .filter(path => emptyCatchPattern.test(read(relative(root, path))))
      .map(path => relative(root, path))

    expect(unsafeFiles).toEqual([])
  })

  it('flags empty catch callbacks even when formatting changes', () => {
    expect(emptyCatchPattern.test('.catch(() => {})')).toBe(true)
    expect(emptyCatchPattern.test('.catch(() => { })')).toBe(true)
    expect(emptyCatchPattern.test('.catch(\n  () => {\n  }\n)')).toBe(true)
    expect(emptyCatchPattern.test('.catch((error) => {})')).toBe(true)
    expect(emptyCatchPattern.test('.catch((error) => report(error))')).toBe(false)
  })

  it('does not use fixed sleeps in E2E specs', () => {
    const sleepFiles = walk(join(root, 'e2e'))
      .filter(path => /\.spec\.ts$/.test(path))
      .filter(path => /waitForTimeout\s*\(/.test(read(relative(root, path))))
      .map(path => relative(root, path))

    expect(sleepFiles).toEqual([])
  })

  it('tags tenant-isolation security coverage by PR-critical and extended surfaces', () => {
    const source = read('e2e/security/tenant-isolation.spec.ts')

    expect(source).toContain('@security-core')
    expect(source).toContain('@security-extended')
    expect(source).toContain('denies cross-organization direct resource and document access')
    expect(source).toContain('protects secondary admin surfaces and per-user chatbot resources')
    expect(source).toContain('enforces invite-link authentication, max-use, revocation, and expiration')
  })
})
