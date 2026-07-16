import { describe, expect, it, vi } from 'vitest'

type PolicyModule = typeof import('../../server/utils/analyticsProxyPolicy')

async function loadPolicy(): Promise<PolicyModule | null> {
  return import('../../server/utils/analyticsProxyPolicy').catch(() => null)
}

describe('analytics proxy policy', () => {
  it('allowlists the deployed PostHog browser SDK route families and methods', async () => {
    const policy = await loadPolicy()

    expect([
      policy?.classifyAnalyticsProxyRequest('e', 'POST'),
      policy?.classifyAnalyticsProxyRequest('e/', 'POST'),
      policy?.classifyAnalyticsProxyRequest('flags', 'POST'),
      policy?.classifyAnalyticsProxyRequest('flags/', 'POST'),
      policy?.classifyAnalyticsProxyRequest('static/1.390.0/exception-autocapture.js', 'GET'),
      policy?.classifyAnalyticsProxyRequest('static/exception-autocapture.js', 'HEAD'),
      policy?.classifyAnalyticsProxyRequest('array/phc_project/config', 'GET'),
      policy?.classifyAnalyticsProxyRequest('array/phc_project/config.js', 'HEAD'),
    ]).toEqual([
      expect.objectContaining({ family: 'capture', upstreamOrigin: 'https://eu.i.posthog.com', rateLimitBucket: 'ingestion' }),
      expect.objectContaining({ family: 'capture', upstreamOrigin: 'https://eu.i.posthog.com', rateLimitBucket: 'ingestion' }),
      expect.objectContaining({ family: 'flags', upstreamOrigin: 'https://eu.i.posthog.com', rateLimitBucket: 'ingestion' }),
      expect.objectContaining({ family: 'flags', upstreamOrigin: 'https://eu.i.posthog.com', rateLimitBucket: 'ingestion' }),
      expect.objectContaining({ family: 'static', upstreamOrigin: 'https://eu-assets.i.posthog.com', rateLimitBucket: 'assets' }),
      expect.objectContaining({ family: 'static', upstreamOrigin: 'https://eu-assets.i.posthog.com', rateLimitBucket: 'assets' }),
      expect.objectContaining({ family: 'array-config', upstreamOrigin: 'https://eu-assets.i.posthog.com', rateLimitBucket: 'assets' }),
      expect.objectContaining({ family: 'array-config', upstreamOrigin: 'https://eu-assets.i.posthog.com', rateLimitBucket: 'assets' }),
    ])
  })

  it('rejects unknown paths, unsupported methods, empty assets, and traversal', async () => {
    const policy = await loadPolicy()

    const attempts = [
      ['decide', 'POST'],
      ['api/surveys', 'GET'],
      ['e', 'GET'],
      ['flags', 'HEAD'],
      ['static/app.js', 'POST'],
      ['array/phc_project/config', 'POST'],
      ['static/', 'GET'],
      ['static/../api/surveys', 'GET'],
      ['static/%2e%2e/api/surveys', 'GET'],
      ['static/app%2Fsecret.js', 'GET'],
      ['static/app\\secret.js', 'GET'],
      ['array/../config', 'GET'],
      ['array/phc_project%2Fother/config', 'GET'],
      ['array/phc_project/other', 'GET'],
    ] as const

    for (const [path, method] of attempts) {
      expect(() => policy?.classifyAnalyticsProxyRequest(path, method)).toThrow()
    }
  })

  it('preserves repeated query parameters without lossy casting', async () => {
    const policy = await loadPolicy()
    const query = new URLSearchParams()
    query.append('ip', 'one')
    query.append('ip', 'two')
    query.append('v', '2')

    const target = policy?.buildAnalyticsProxyTarget(
      policy.classifyAnalyticsProxyRequest('flags/', 'POST'),
      query,
    )

    expect(target).toBe('https://eu.i.posthog.com/flags/?ip=one&ip=two&v=2')
  })

  it('forwards only the minimal safe request headers', async () => {
    const policy = await loadPolicy()
    const headers = policy?.filterAnalyticsProxyRequestHeaders({
      accept: 'application/json',
      'accept-language': 'en-US',
      'content-type': 'application/json',
      origin: 'https://careers.thefactoryhq.com',
      referer: 'https://careers.thefactoryhq.com/dashboard',
      'user-agent': 'browser',
      cookie: 'session=secret',
      authorization: 'Bearer secret',
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '203.0.113.7',
      host: 'careers.thefactoryhq.com',
    })

    expect(Object.fromEntries(headers?.entries() ?? [])).toEqual({
      accept: 'application/json',
      'accept-language': 'en-US',
      'content-type': 'application/json',
      origin: 'https://careers.thefactoryhq.com',
      referer: 'https://careers.thefactoryhq.com/dashboard',
      'user-agent': 'browser',
    })
  })
})

describe('analytics proxy execution', () => {
  async function setup() {
    const policy = await loadPolicy()
    expect(policy).not.toBeNull()
    return policy!
  }

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      path: 'e',
      method: 'POST',
      query: new URLSearchParams(),
      headers: { 'content-length': '2', 'content-type': 'application/json' },
      readBody: vi.fn(async () => new Uint8Array([123, 125])),
      ...overrides,
    }
  }

  function makeDependencies(response = new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': '2' },
  })) {
    return {
      fetch: vi.fn(async () => response),
      enforceRateLimit: vi.fn(async () => undefined),
    }
  }

  it.each([
    [undefined, 411],
    ['', 411],
    ['wat', 411],
    ['-1', 411],
    ['1.5', 411],
    [String(1024 * 1024 + 1), 413],
  ])('rejects POST Content-Length %j before reading or fetching', async (contentLength, statusCode) => {
    const policy = await setup()
    const request = makeRequest({
      headers: contentLength === undefined ? {} : { 'content-length': contentLength },
    })
    const dependencies = makeDependencies()

    await expect(policy.executeAnalyticsProxyRequest(request, dependencies)).rejects.toMatchObject({ statusCode })
    expect(request.readBody).not.toHaveBeenCalled()
    expect(dependencies.fetch).not.toHaveBeenCalled()
  })

  it('rejects an actual body over 1 MiB even when the declared length lies', async () => {
    const policy = await setup()
    const request = makeRequest({
      headers: { 'content-length': '1' },
      readBody: vi.fn(async () => new Uint8Array(1024 * 1024 + 1)),
    })
    const dependencies = makeDependencies()

    await expect(policy.executeAnalyticsProxyRequest(request, dependencies)).rejects.toMatchObject({ statusCode: 413 })
    expect(dependencies.fetch).not.toHaveBeenCalled()
  })

  it('rejects a declared and actual body length mismatch', async () => {
    const policy = await setup()
    const dependencies = makeDependencies()

    await expect(policy.executeAnalyticsProxyRequest(makeRequest({
      headers: { 'content-length': '1' },
    }), dependencies)).rejects.toMatchObject({ statusCode: 400 })
    expect(dependencies.fetch).not.toHaveBeenCalled()
  })

  it('rejects unknown paths and unsupported methods without rate limiting, body reads, or upstream fetches', async () => {
    const policy = await setup()
    const dependencies = makeDependencies()
    const unknown = makeRequest({ path: 'api/projects', method: 'POST' })
    const wrongMethod = makeRequest({ path: 'e', method: 'GET', headers: {} })

    await expect(policy.executeAnalyticsProxyRequest(unknown, dependencies)).rejects.toMatchObject({ statusCode: 404 })
    await expect(policy.executeAnalyticsProxyRequest(wrongMethod, dependencies)).rejects.toMatchObject({ statusCode: 405 })
    expect(dependencies.enforceRateLimit).not.toHaveBeenCalled()
    expect(unknown.readBody).not.toHaveBeenCalled()
    expect(wrongMethod.readBody).not.toHaveBeenCalled()
    expect(dependencies.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['e', 'POST', 'ingestion'],
    ['flags/', 'POST', 'ingestion'],
    ['static/exception-autocapture.js', 'GET', 'assets'],
    ['static/1.390.0/exception-autocapture.js', 'HEAD', 'assets'],
    ['array/phc_project/config', 'GET', 'assets'],
    ['array/phc_project/config.js', 'HEAD', 'assets'],
  ])('selects the %s %s rate bucket before fetching', async (path, method, rateLimitBucket) => {
    const policy = await setup()
    const dependencies = makeDependencies()
    const request = makeRequest({
      path,
      method,
      headers: method === 'POST' ? { 'content-length': '2' } : {},
    })

    await policy.executeAnalyticsProxyRequest(request, dependencies)

    expect(dependencies.enforceRateLimit).toHaveBeenCalledWith(rateLimitBucket)
    expect(dependencies.fetch).toHaveBeenCalledTimes(1)
  })

  it('uses the fixed assets host, preserves query arrays, strips sensitive headers, and disables redirect following', async () => {
    const policy = await setup()
    const dependencies = makeDependencies()
    const query = new URLSearchParams([['v', '1'], ['v', '2']])

    await policy.executeAnalyticsProxyRequest(makeRequest({
      path: 'array/phc_project/config.js',
      method: 'GET',
      query,
      headers: {
        accept: 'application/javascript',
        authorization: 'secret',
        cookie: 'secret',
        'x-forwarded-for': '203.0.113.1',
      },
    }), dependencies)

    const [target, init] = dependencies.fetch.mock.calls[0]!
    expect(target).toBe('https://eu-assets.i.posthog.com/array/phc_project/config.js?v=1&v=2')
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual' })
    expect(Object.fromEntries((init!.headers as Headers).entries())).toEqual({ accept: 'application/javascript' })
  })

  it('returns a generic 502 when the upstream fetch fails', async () => {
    const policy = await setup()
    const dependencies = makeDependencies()
    dependencies.fetch.mockRejectedValueOnce(new Error('upstream token or DNS detail'))

    await expect(policy.executeAnalyticsProxyRequest(makeRequest(), dependencies)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: 'Analytics upstream request failed',
    })
  })

  it('does not relay an upstream redirect or its Location header', async () => {
    const policy = await setup()
    const dependencies = makeDependencies(new Response('moved', {
      status: 302,
      headers: { location: 'https://unexpected.example/private' },
    }))

    await expect(policy.executeAnalyticsProxyRequest(makeRequest(), dependencies)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: 'Analytics upstream returned an unexpected redirect',
    })
  })

  it('rejects an upstream Content-Length over 2 MiB before reading the stream', async () => {
    const policy = await setup()
    const cancel = vi.fn(async () => undefined)
    const response = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-length': String(2 * 1024 * 1024 + 1) }),
      body: { cancel },
    } as unknown as Response
    const dependencies = makeDependencies(response)

    await expect(policy.executeAnalyticsProxyRequest(makeRequest(), dependencies)).rejects.toMatchObject({ statusCode: 502 })
    expect(cancel).toHaveBeenCalled()
  })

  it('cancels and rejects a streamed upstream response once it crosses 2 MiB', async () => {
    const policy = await setup()
    const cancel = vi.fn(async () => undefined)
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(2 * 1024 * 1024) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) })
    const response = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: { getReader: () => ({ read, cancel }) },
    } as unknown as Response
    const dependencies = makeDependencies(response)

    await expect(policy.executeAnalyticsProxyRequest(makeRequest(), dependencies)).rejects.toMatchObject({ statusCode: 502 })
    expect(cancel).toHaveBeenCalled()
  })

  it('returns a bounded body and only safe upstream response headers', async () => {
    const policy = await setup()
    const response = new Response('ok', {
      status: 202,
      statusText: 'Accepted',
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'set-cookie': 'upstream=secret',
        location: 'https://attacker.example',
        'x-upstream-secret': 'secret',
      },
    })

    const result = await policy.executeAnalyticsProxyRequest(makeRequest(), makeDependencies(response))

    expect(result).toMatchObject({ status: 202, statusText: 'Accepted' })
    expect(new TextDecoder().decode(result.body)).toBe('ok')
    expect(Object.fromEntries(result.headers.entries())).toEqual({
      'cache-control': 'no-store',
      'content-type': 'application/json',
    })
  })
})
