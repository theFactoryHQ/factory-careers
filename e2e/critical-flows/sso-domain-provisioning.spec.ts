import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect } from '../fixtures'

type MockOidcIssuer = {
  issuer: string
  close: () => Promise<void>
}

function getMockOidcIssuerPort(): number {
  const rawPort = process.env.E2E_SSO_MOCK_PORT ?? '3999'
  const port = Number(rawPort)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_SSO_MOCK_PORT must be an integer from 1 to 65535; received ${JSON.stringify(rawPort)}`)
  }

  return port
}

async function startMockOidcIssuer(): Promise<MockOidcIssuer> {
  let server: Server
  const port = getMockOidcIssuerPort()

  server = createServer((req, res) => {
    const address = server.address() as AddressInfo
    const issuer = `http://127.0.0.1:${address.port}`

    if (req.url === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      }))
      return
    }

    if (req.url?.startsWith('/authorize')) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<main><h1>Mock IdP sign-in</h1></main>')
      return
    }

    if (req.url === '/jwks') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [] }))
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Mock OIDC issuer could not bind to 127.0.0.1:${port}. Set E2E_SSO_MOCK_PORT to an available port and include it in BETTER_AUTH_TRUSTED_ORIGINS.`))
        return
      }

      reject(error)
    })
    server.listen(port, '127.0.0.1', () => {
      server.removeAllListeners('error')
      resolve()
    })
  })

  const address = server.address() as AddressInfo

  return {
    issuer: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

test.describe('SSO domain provisioning', () => {
  test('routes configured work domains to local SSO only and rejects unconfigured domains', async ({ authenticatedPage, browser }, testInfo) => {
    const id = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2)}`
    const providerId = `sso-${id}`
    const domain = `sso-${id}.example.com`
    const mockIssuer = await startMockOidcIssuer()

    try {
      await authenticatedPage.goto('/dashboard/settings/sso')
      await expect(authenticatedPage.getByRole('heading', { name: 'Single Sign-On' })).toBeVisible()
      await authenticatedPage.getByRole('button', { name: /Add SSO Provider|Add another provider/ }).click()
      await authenticatedPage.getByLabel('Email domain').fill(domain)
      await authenticatedPage.getByLabel('Issuer URL').fill(mockIssuer.issuer)
      await authenticatedPage.getByLabel('Provider ID').fill(providerId)
      await authenticatedPage.getByLabel('Client ID').fill(`client-${id}`)
      await authenticatedPage.getByLabel('Client Secret').fill(`secret-${id}`)

      const [registrationResponse] = await Promise.all([
        authenticatedPage.waitForResponse(
          resp => resp.url().includes('/api/sso/providers') && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        authenticatedPage.getByRole('button', { name: 'Register SSO Provider' }).click(),
      ])
      expect(
        registrationResponse.status(),
        await registrationResponse.text(),
      ).toBe(201)

      await expect(authenticatedPage.getByRole('heading', { name: providerId })).toBeVisible()
      await expect(authenticatedPage.getByText(domain, { exact: true })).toBeVisible()

      const callbackUrl = authenticatedPage.getByText(new RegExp(`/api/auth/sso/callback/${providerId}$`))
      await expect(callbackUrl).toBeVisible()
      await expect(callbackUrl).toContainText('http://127.0.0.1:3333')
      await expect(callbackUrl).not.toContainText('thefactoryhq.com')

      const api = authenticatedPage.context().request
      const localCallback = '/dashboard'
      const localErrorCallback = '/auth/sign-in'
      const unconfiguredResponse = await api.post('/api/auth/sign-in/sso', {
        headers: { origin: 'http://127.0.0.1:3333' },
        data: {
          email: `intruder@unconfigured-${id}.example.com`,
          callbackURL: localCallback,
          errorCallbackURL: localErrorCallback,
          providerType: 'oidc',
        },
      })
      expect(unconfiguredResponse.status()).toBe(404)

      const configuredEmail = `owner@${domain}`
      const configuredResponse = await api.post('/api/auth/sign-in/sso', {
        headers: { origin: 'http://127.0.0.1:3333' },
        data: {
          email: configuredEmail,
          callbackURL: localCallback,
          errorCallbackURL: localErrorCallback,
          providerType: 'oidc',
        },
      })
      expect(configuredResponse.status()).toBe(200)
      const ssoPayload = await configuredResponse.json()
      const redirectUrl = new URL(String(ssoPayload.url))
      expect(redirectUrl.origin).toBe(mockIssuer.issuer)
      expect(redirectUrl.pathname).toBe('/authorize')
      expect(redirectUrl.searchParams.get('login_hint')).toBe(configuredEmail)
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(`http://127.0.0.1:3333/api/auth/sso/callback/${providerId}`)
      expect(ssoPayload.url).not.toContain('thefactoryhq.com')

      const appOrigin = new URL(authenticatedPage.url()).origin
      const signInContext = await browser.newContext({
        baseURL: appOrigin,
        storageState: { cookies: [], origins: [] },
      })
      const signInPage = await signInContext.newPage()
      await signInPage.goto('/auth/sign-in')
      await expect(signInPage).toHaveURL(/\/auth\/sign-in/)
      await expect(signInPage.getByRole('button', { name: 'Continue with SSO' })).toBeVisible()
      await signInPage.getByLabel('Work email').fill(configuredEmail)

      const ssoResponsePromise = signInPage.waitForResponse(
        resp => resp.url().includes('/api/auth/sign-in/sso') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      )

      await signInPage.getByRole('button', { name: 'Continue with SSO' }).click()
      const ssoResponse = await ssoResponsePromise
      expect(ssoResponse.status()).toBe(200)

      await expect(signInPage.getByRole('heading', { name: 'Mock IdP sign-in' })).toBeVisible()
      await signInContext.close()
    }
    finally {
      await mockIssuer.close()
    }
  })
})
