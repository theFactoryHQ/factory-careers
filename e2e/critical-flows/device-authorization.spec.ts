import type { APIRequestContext, APIResponse } from '@playwright/test'
import { assertMutatingE2ESafety } from '../safety'
import { expect, test } from '../fixtures'

const CLI_CLIENT_ID = 'factory-careers-cli'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

type DeviceTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

type DeviceTokenError = {
  error: string
  error_description: string
}

async function expectStatus(response: APIResponse, expected: number, label: string) {
  expect(response.status(), `${label} returned ${response.status()}: ${await response.text()}`).toBe(expected)
}

async function requestDeviceCode(request: APIRequestContext): Promise<DeviceCodeResponse> {
  const response = await request.post('/api/auth/device/code', {
    data: {
      client_id: CLI_CLIENT_ID,
      scope: 'openid profile email',
    },
  })
  await expectStatus(response, 200, 'Device code API')
  const body = await response.json() as DeviceCodeResponse
  expect(body.device_code, 'device code must be returned for CLI polling').toBeTruthy()
  expect(body.user_code, 'user code must be returned for browser approval').toBeTruthy()
  expect(body.verification_uri).toContain('/device')
  expect(body.verification_uri_complete).toContain(`/device?user_code=${encodeURIComponent(body.user_code)}`)
  expect(body.expires_in).toBeGreaterThan(0)
  expect(body.interval).toBeGreaterThan(0)
  return body
}

async function exchangeDeviceToken(request: APIRequestContext, deviceCode: string): Promise<APIResponse> {
  return await request.post('/api/auth/device/token', {
    data: {
      grant_type: DEVICE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: CLI_CLIENT_ID,
    },
  })
}

test.describe('CLI device authorization handoff', () => {
  test('approves a CLI device code in the browser and rejects denied or invalid exchanges', async ({ authenticatedPage, request }, testInfo) => {
    const page = authenticatedPage
    const baseURL = String(testInfo.project.use.baseURL ?? '')
    assertMutatingE2ESafety({
      env: {
        PLAYWRIGHT_BASE_URL: baseURL,
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        NUXT_PUBLIC_SITE_URL: process.env.NUXT_PUBLIC_SITE_URL,
      },
    })

    const invalidExchange = await exchangeDeviceToken(request, 'not-a-real-device-code')
    await expectStatus(invalidExchange, 400, 'Invalid device token exchange')
    const invalidExchangeBody = await invalidExchange.json() as DeviceTokenError
    expect(invalidExchangeBody.error).toBe('invalid_grant')

    const approvedDevice = await requestDeviceCode(request)
    await page.goto(`/device?user_code=${encodeURIComponent(approvedDevice.user_code)}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Approve CLI access?' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Device code')).toHaveValue(approvedDevice.user_code)
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText('This device request was approved. You can close this page.')).toBeVisible()

    const tokenResponse = await exchangeDeviceToken(request, approvedDevice.device_code)
    await expectStatus(tokenResponse, 200, 'Approved device token exchange')
    const token = await tokenResponse.json() as DeviceTokenResponse
    expect(token.token_type).toBe('Bearer')
    expect(token.access_token, 'approved device exchange must return a bearer token').toBeTruthy()
    expect(token.expires_in).toBeGreaterThan(0)

    const capabilitiesResponse = await request.get('/api/cli/capabilities', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    await expectStatus(capabilitiesResponse, 200, 'Bearer capabilities API')
    const capabilities = await capabilitiesResponse.json() as { application: string, route: string }
    expect(capabilities).toMatchObject({
      application: 'factory-careers',
      route: '/api/cli/capabilities',
    })

    const dashboardStatsResponse = await request.get('/api/dashboard/stats', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    await expectStatus(dashboardStatsResponse, 200, 'Bearer dashboard stats API')
    const dashboardStats = await dashboardStatsResponse.json() as { counts?: { openJobs?: number } }
    expect(typeof dashboardStats.counts?.openJobs).toBe('number')

    const deniedDevice = await requestDeviceCode(request)
    await page.goto(`/device?user_code=${encodeURIComponent(deniedDevice.user_code)}`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Approve CLI access?' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Deny' }).click()
    await expect(page.getByText('This device request was denied. You can close this page.')).toBeVisible()

    const deniedExchange = await exchangeDeviceToken(request, deniedDevice.device_code)
    await expectStatus(deniedExchange, 400, 'Denied device token exchange')
    const deniedExchangeBody = await deniedExchange.json() as DeviceTokenError
    expect(deniedExchangeBody.error).toBe('access_denied')
  })
})
