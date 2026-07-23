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

  it('provisions PostgreSQL 16 and runs the notification test in required mode', () => {
    const workflow = read('.github/workflows/pr-validation.yml')

    expect(workflow).toContain('image: postgres:16-alpine')
    expect(workflow).toContain('--health-cmd "pg_isready -U factory_notifications_ci -d factory_notifications_ci"')
    expect(workflow).toContain('--health-interval 5s')
    expect(workflow).toContain('--health-timeout 5s')
    expect(workflow).toContain('--health-retries 10')
    expect(workflow).toContain('name: Run application notification PostgreSQL integration test')
    expect(workflow).toContain('run: npm run test:integration:application-notifications')
    expect(workflow).toContain(
      'APPLICATION_NOTIFICATION_PG_TEST_URL: postgresql://factory_notifications_ci:factory_notifications_ci@127.0.0.1:5432/postgres',
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
