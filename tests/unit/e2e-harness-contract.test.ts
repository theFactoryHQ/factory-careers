import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const emptyCatchPattern = /\.catch\s*\(\s*(?:\([^)]*\)|[$A-Z_a-z][$\w]*)\s*=>\s*\{\s*\}\s*\)/m

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
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
      'playwright test e2e/critical-flows/invitation-management.spec.ts',
    )
  })

  it('runs invitation management browser coverage in a dedicated UI CI lane', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).toContain('name: Playwright UI')
    expect(workflow).toContain('npm run test:e2e:ui')
    expect(workflow).toContain('needs: [smoke, security-core, uploads, ui]')
    expect(workflow).toContain('needs.ui.result')
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
    expect(workflow).toContain('needs: [smoke, security-core, uploads, ui]')
  })

  it('runs core tenant/document/RBAC security checks in CI', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).toContain('name: Playwright security core')
    expect(workflow).toContain('npm run test:e2e:security:core')
    expect(workflow).toContain('minio/minio')
    expect(workflow).toContain('S3_SKIP_BUCKET_INIT: "false"')
  })

  it('keeps the branch-protection E2E status as an aggregate of the split jobs', () => {
    const workflow = read('.github/workflows/e2e-tests.yml')

    expect(workflow).toContain('name: Playwright E2E')
    expect(workflow).toContain('needs: [smoke, security-core, uploads, ui]')
    expect(workflow).toContain('needs.smoke.result')
    expect(workflow).toContain('needs.security-core.result')
    expect(workflow).toContain('needs.uploads.result')
    expect(workflow).toContain('needs.ui.result')
  })

  it('keeps Playwright parallel-ready for independent smoke specs', () => {
    const config = read('playwright.config.ts')

    expect(config).toContain('fullyParallel: true')
    expect(config).toContain('workers: process.env.CI ? 2 : undefined')
    expect(config).toContain('trace: process.env.CI ?')
    expect(config).toContain('FEATURE_FLAG_CHATBOT_EXPERIENCE=true')
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
