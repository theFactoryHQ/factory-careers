import { defineConfig, devices } from '@playwright/test'
import { assertMutatingE2ESafety } from './e2e/safety'

assertMutatingE2ESafety()

function shellEnv(name: string, value: string | undefined) {
  return value ? `${name}=${JSON.stringify(value)}` : ''
}

const ssoMockPort = process.env.E2E_SSO_MOCK_PORT ?? '3999'

const webServerEnv = [
  'BETTER_AUTH_URL=http://127.0.0.1:3333',
  `BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3333,http://127.0.0.1:${ssoMockPort}`,
  'NUXT_PUBLIC_SITE_URL=http://127.0.0.1:3333',
  'FACTORY_DISABLE_PUBLIC_SIGNUP=false',
  'FACTORY_DISABLE_PUBLIC_ORG_CREATION=false',
  `E2E_SSO_MOCK_PORT=${ssoMockPort}`,
  'FEATURE_FLAG_CHATBOT_EXPERIENCE=true',
  shellEnv('FACTORY_EMAIL_TEST_MODE', process.env.FACTORY_EMAIL_TEST_MODE),
  shellEnv('FACTORY_EMAIL_CAPTURE_PATH', process.env.FACTORY_EMAIL_CAPTURE_PATH),
  shellEnv('FACTORY_CAREERS_HIRING_INBOX', process.env.FACTORY_CAREERS_HIRING_INBOX),
].filter(Boolean).join(' ')

/**
 * Playwright E2E configuration for Reqcore.
 *
 * Tests the most critical user outcomes:
 * - Creating a job (authenticated recruiter flow)
 * - Candidate applying to a job (public flow)
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
      ]
    : [
        ['html'],
      ],
  timeout: process.env.CI ? 90_000 : 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3333',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  ...(process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? {}
    : {
        webServer: {
          command: `${webServerEnv} npm run db:migrate && ${webServerEnv} npx nuxt dev --port 3333 --host 127.0.0.1`,
          url: 'http://127.0.0.1:3333',
          reuseExistingServer: true,
          timeout: process.env.CI ? 120_000 : 60_000,
        },
      }),
})
