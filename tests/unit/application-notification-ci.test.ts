import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification PostgreSQL CI gate', () => {
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
})
