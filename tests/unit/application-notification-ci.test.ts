import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification PostgreSQL CI gate', () => {
  const corePostgresSuites = [
    'tests/integration/application-current-analysis-run.pg.test.ts',
    'tests/integration/job-pipeline.pg.test.ts',
    'tests/integration/processing-queue.pg.test.ts',
    'tests/integration/property-filters.pg.test.ts',
    'tests/integration/sso-provider-secrets.pg.test.ts',
    'tests/integration/document-erasure-queue.pg.test.ts',
    'tests/integration/document-erasure-adoption.pg.test.ts',
  ]

  it('exposes a dedicated script for the notification PostgreSQL test', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['test:integration:application-notifications'])
      .toBe(
        'vitest run tests/integration/application-notifications.pg.test.ts tests/integration/candidate-workflow-email.pg.test.ts',
      )
  })

  it('provisions isolated PostgreSQL and runs the notification test in required mode', () => {
    const workflow = read('.github/workflows/pr-validation.yml')
    const postgresAction = read('.github/actions/setup-postgres/action.yml')

    expect(workflow).toContain('runs-on: [self-hosted, macOS, ARM64, factory-careers]')
    expect(workflow).toContain('uses: ./.github/actions/setup-postgres')
    expect(workflow).toContain('database: factory_notifications_ci')
    expect(postgresAction).toContain('brew --prefix postgresql@17')
    expect(postgresAction).toContain('pg_ctl')
    expect(workflow).toContain('name: Run application notification PostgreSQL integration test')
    expect(workflow).toContain('run: npm run test:integration:application-notifications')
    expect(workflow).toContain(
      'APPLICATION_NOTIFICATION_PG_TEST_URL: postgresql://factory_notifications_ci:factory_notifications_ci@127.0.0.1:55440/postgres',
    )
    expect(workflow).toContain('APPLICATION_NOTIFICATION_PG_REQUIRED: "true"')
  })

  it('makes required mode fail clearly when its admin URL is missing', () => {
    const integrationTest = read('tests/integration/application-notifications.pg.test.ts')

    expect(integrationTest).toContain(
      "process.env.APPLICATION_NOTIFICATION_PG_REQUIRED === 'true'",
    )
    expect(integrationTest).toContain(
      'APPLICATION_NOTIFICATION_PG_TEST_URL is required when APPLICATION_NOTIFICATION_PG_REQUIRED=true',
    )
  })

  it('exposes one deterministic script for the core PostgreSQL suites', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['test:integration:postgres-core']).toBe(
      `vitest run ${corePostgresSuites.join(' ')}`,
    )
  })

  it('runs the core PostgreSQL suites in required mode after notification coverage', () => {
    const workflow = read('.github/workflows/pr-validation.yml')
    const notificationStep = workflow.indexOf(
      'name: Run application notification PostgreSQL integration test',
    )
    const coreStep = workflow.indexOf('name: Run core PostgreSQL integration tests')
    const lintStep = workflow.indexOf('name: Lint')

    expect(notificationStep).toBeGreaterThanOrEqual(0)
    expect(coreStep).toBeGreaterThan(notificationStep)
    expect(lintStep).toBeGreaterThan(coreStep)
    expect(workflow).toContain('run: npm run test:integration:postgres-core')
    expect(workflow).toContain(
      'FACTORY_CORE_PG_TEST_URL: postgresql://factory_notifications_ci:factory_notifications_ci@127.0.0.1:55440/postgres',
    )
    expect(workflow).toContain('FACTORY_CORE_PG_REQUIRED: "true"')
  })

  it.each(corePostgresSuites)(
    '%s prefers the shared URL and fails clearly when required mode lacks it',
    (suite) => {
      const integrationTest = read(suite)

      expect(integrationTest).toContain('process.env.FACTORY_CORE_PG_TEST_URL')
      expect(integrationTest).toContain("process.env.FACTORY_CORE_PG_REQUIRED === 'true'")
      expect(integrationTest).toContain(
        'FACTORY_CORE_PG_TEST_URL is required when FACTORY_CORE_PG_REQUIRED=true',
      )
    },
  )
})
