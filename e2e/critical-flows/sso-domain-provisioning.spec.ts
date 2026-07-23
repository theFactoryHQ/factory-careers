import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect } from '../fixtures'
import { withE2eDb } from '../helpers/db'
import { SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX } from '../../server/utils/ssoProviderSecrets'

type MockOidcIssuer = {
  issuer: string
  tokenExchangeCount: () => number
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

async function startMockOidcIssuer(options: {
  clientId: string
  clientSecret: string
}): Promise<MockOidcIssuer> {
  let server: Server
  const port = getMockOidcIssuerPort()
  let tokenExchangeCount = 0
  const emailsByCode = new Map<string, string>()
  const emailsByAccessToken = new Map<string, string>()

  server = createServer((req, res) => {
    const address = server.address() as AddressInfo
    const issuer = `http://127.0.0.1:${address.port}`
    const requestUrl = new URL(req.url || '/', issuer)

    if (requestUrl.pathname === '/.well-known/openid-configuration') {
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

    if (requestUrl.pathname === '/authorize') {
      const state = requestUrl.searchParams.get('state')
      const redirectUri = requestUrl.searchParams.get('redirect_uri')
      const email = requestUrl.searchParams.get('login_hint')
      if (!state || !redirectUri || !email) {
        res.writeHead(400)
        res.end('missing OIDC authorization parameters')
        return
      }

      const code = `mock-code-${emailsByCode.size + 1}`
      emailsByCode.set(code, email)
      const callback = new URL(redirectUri)
      callback.searchParams.set('code', code)
      callback.searchParams.set('state', state)
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<main><h1>Mock IdP sign-in</h1><a href="${callback.toString()}">Continue with mock IdP</a></main>`)
      return
    }

    if (requestUrl.pathname === '/token' && req.method === 'POST') {
      const expectedAuthorization = `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')}`
      if (req.headers.authorization !== expectedAuthorization) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_client' }))
        return
      }

      let body = ''
      req.setEncoding('utf8')
      req.on('data', chunk => {
        body += chunk
      })
      req.on('end', () => {
        const code = new URLSearchParams(body).get('code')
        const email = code ? emailsByCode.get(code) : undefined
        if (!code || !email) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid_grant' }))
          return
        }

        const accessToken = `mock-access-${code}`
        emailsByAccessToken.set(accessToken, email)
        tokenExchangeCount += 1
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email profile',
        }))
      })
      return
    }

    if (requestUrl.pathname === '/userinfo') {
      const accessToken = req.headers.authorization?.replace(/^Bearer /, '')
      const email = accessToken
        ? emailsByAccessToken.get(accessToken)
        : undefined
      if (!email) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_token' }))
        return
      }

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        sub: `mock-user-${email}`,
        email,
        email_verified: true,
        name: 'Mock SSO User',
      }))
      return
    }

    if (requestUrl.pathname === '/jwks') {
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
    tokenExchangeCount: () => tokenExchangeCount,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

test.describe('SSO domain provisioning', () => {
  test('routes configured work domains to local SSO only and rejects unconfigured domains', async ({ authenticatedPage, browser }, testInfo) => {
    const id = `${Date.now()}-${testInfo.workerIndex}-${randomUUID()}`
    const providerId = `sso-${id}`
    const domain = `sso-${id}.example.com`
    const clientId = `client-${id}`
    const clientSecret = `secret-${id}`
    const mockIssuer = await startMockOidcIssuer({ clientId, clientSecret })

    try {
      await authenticatedPage.goto('/dashboard/settings/sso')
      await expect(authenticatedPage.getByRole('heading', { name: 'Single Sign-On' })).toBeVisible()
      await authenticatedPage.getByRole('button', { name: /Add SSO Provider|Add another provider/ }).click()
      await authenticatedPage.getByLabel('Email domain').fill(domain)
      await authenticatedPage.getByLabel('Issuer URL').fill(mockIssuer.issuer)
      await authenticatedPage.getByLabel('Provider ID').fill(providerId)
      await authenticatedPage.getByLabel('Client ID').fill(clientId)
      await authenticatedPage.getByLabel('Client Secret').fill(clientSecret)

      const [registrationResponse] = await Promise.all([
        authenticatedPage.waitForResponse(
          resp => resp.url().includes('/api/sso/providers') && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        authenticatedPage.getByRole('button', { name: 'Register SSO Provider' }).click(),
      ])
      const registrationBody = await registrationResponse.text()
      expect(registrationResponse.status(), registrationBody).toBe(201)
      expect(registrationBody).not.toContain(clientSecret)
      expect(registrationBody).not.toContain(
        SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX,
      )

      const rawOidcConfig = await withE2eDb(
        'SSO encrypted client-secret lookup',
        async (sql) => {
          const [record] = await sql<{ oidcConfig: string }[]>`
            select "oidc_config" as "oidcConfig"
            from "sso_provider"
            where "provider_id" = ${providerId}
          `
          return record?.oidcConfig
        },
      )
      expect(rawOidcConfig).toBeTruthy()
      expect(rawOidcConfig).not.toContain(clientSecret)
      const storedClientSecret = (JSON.parse(rawOidcConfig!) as {
        clientSecret: string
      }).clientSecret
      expect(storedClientSecret.startsWith(
        SSO_CLIENT_SECRET_CIPHERTEXT_PREFIX,
      )).toBe(true)

      const managementResponse = await authenticatedPage.context().request.get(
        '/api/sso/providers',
      )
      expect(managementResponse.status()).toBe(200)
      const managementBody = await managementResponse.text()
      expect(managementBody).not.toContain(clientSecret)
      expect(managementBody).not.toContain(storedClientSecret)

      for (const builtInManagementPath of [
        '/api/auth/sso/providers',
        `/api/auth/sso/get-provider?providerId=${encodeURIComponent(providerId)}`,
      ]) {
        const response = await authenticatedPage.context().request.get(
          builtInManagementPath,
          { headers: { origin: 'http://127.0.0.1:3333' } },
        )
        const responseBody = await response.text()
        expect(response.status(), responseBody).toBe(200)
        expect(responseBody).not.toContain(clientSecret)
        expect(responseBody).not.toContain(storedClientSecret)
      }

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
      await signInPage.waitForLoadState('networkidle')
      await expect(signInPage).toHaveURL(/\/auth\/sign-in/)
      await expect(signInPage.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible()
      await signInPage.getByLabel('Work email').fill(configuredEmail)

      const ssoResponsePromise = signInPage.waitForResponse(
        resp => resp.url().includes('/api/auth/sign-in/sso') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      )

      await signInPage.getByRole('button', { name: 'Sign in with Microsoft' }).click()
      const ssoResponse = await ssoResponsePromise
      expect(ssoResponse.status()).toBe(200)

      await expect(signInPage.getByRole('heading', { name: 'Mock IdP sign-in' })).toBeVisible()
      await signInPage.getByRole('link', { name: 'Continue with mock IdP' }).click()
      await expect(signInPage).toHaveURL(/\/dashboard(?:\/|$)/)
      expect(mockIssuer.tokenExchangeCount()).toBe(1)
      await signInContext.close()
    }
    finally {
      await mockIssuer.close()
    }
  })
})
