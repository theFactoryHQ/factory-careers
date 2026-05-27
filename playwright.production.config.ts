import { defineConfig, devices } from '@playwright/test'
import { assertMutatingE2ESafety } from './e2e/safety'

assertMutatingE2ESafety()

function shellEnv(name: string, value: string | undefined) {
  return value ? `${name}=${JSON.stringify(value)}` : ''
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3334'
const serverUrl = new URL(baseURL)
const serverHost = serverUrl.hostname
const serverPort = serverUrl.port || (serverUrl.protocol === 'https:' ? '443' : '80')

const webServerEnv = [
  `HOST=${JSON.stringify(serverHost)}`,
  `PORT=${JSON.stringify(serverPort)}`,
  `NITRO_HOST=${JSON.stringify(serverHost)}`,
  `NITRO_PORT=${JSON.stringify(serverPort)}`,
  `BETTER_AUTH_URL=${JSON.stringify(baseURL)}`,
  `BETTER_AUTH_TRUSTED_ORIGINS=${JSON.stringify(process.env.BETTER_AUTH_TRUSTED_ORIGINS || baseURL)}`,
  `NUXT_PUBLIC_SITE_URL=${JSON.stringify(process.env.NUXT_PUBLIC_SITE_URL || baseURL)}`,
  'FACTORY_DISABLE_PUBLIC_SIGNUP=false',
  'FACTORY_DISABLE_PUBLIC_ORG_CREATION=false',
  shellEnv('DATABASE_URL', process.env.DATABASE_URL),
  shellEnv('BETTER_AUTH_SECRET', process.env.BETTER_AUTH_SECRET),
  shellEnv('S3_ENDPOINT', process.env.S3_ENDPOINT),
  shellEnv('S3_ACCESS_KEY', process.env.S3_ACCESS_KEY),
  shellEnv('S3_SECRET_KEY', process.env.S3_SECRET_KEY),
  shellEnv('S3_BUCKET', process.env.S3_BUCKET),
  shellEnv('S3_REGION', process.env.S3_REGION),
  shellEnv('S3_FORCE_PATH_STYLE', process.env.S3_FORCE_PATH_STYLE),
  shellEnv('S3_SKIP_BUCKET_INIT', process.env.S3_SKIP_BUCKET_INIT),
  shellEnv('SMTP_FROM', process.env.SMTP_FROM),
].filter(Boolean).join(' ')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
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
    baseURL,
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
          command: `${webServerEnv} npm run db:migrate && ${webServerEnv} npm run build && ${webServerEnv} node .output/server/index.mjs`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: process.env.CI ? 180_000 : 120_000,
        },
      }),
})
