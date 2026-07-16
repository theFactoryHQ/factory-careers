import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeEvent {
  method: string
  path: string
  url: string
  socketIp: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  responseStatus?: number
  responseStatusText?: string
  node: {
    req: FakeRequestStream
    res?: {
      once: (event: 'finish' | 'close', listener: () => void) => unknown
    }
  }
}

interface FakeRequestStream extends AsyncIterable<Uint8Array> {
  destroy: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  consumedChunks: number
  iterator: (options: { destroyOnReturn: boolean }) => AsyncIterator<Uint8Array>
}

function makeRequestStream(chunks: Uint8Array[]): FakeRequestStream {
  async function* chunksIterator() {
    for (const chunk of chunks) {
      stream.consumedChunks += 1
      yield chunk
    }
  }

  const stream = {
    destroy: vi.fn(),
    resume: vi.fn(),
    consumedChunks: 0,
    iterator: vi.fn((options: { destroyOnReturn: boolean }) => {
      expect(options).toEqual({ destroyOnReturn: false })
      return chunksIterator()
    }),
    [Symbol.asyncIterator]: chunksIterator,
  } satisfies FakeRequestStream
  return stream
}

function makeResponseLifecycle() {
  const listeners = new Map<'finish' | 'close', Array<() => void>>()
  return {
    response: {
      once(event: 'finish' | 'close', listener: () => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
      },
    },
    emit(event: 'finish' | 'close') {
      for (const listener of listeners.get(event) ?? []) listener()
      listeners.delete(event)
    },
  }
}

const fetchMock = vi.fn()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: FakeEvent) => event.path)
vi.stubGlobal('getRequestURL', (event: FakeEvent) => new URL(event.url))
vi.stubGlobal('getRequestHeaders', (event: FakeEvent) => event.requestHeaders)
vi.stubGlobal('getRequestIP', (event: FakeEvent) => event.socketIp)
vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.requestHeaders[name.toLowerCase()])
vi.stubGlobal('setResponseHeaders', (event: FakeEvent, headers: Record<string, string | number>) => {
  for (const [name, value] of Object.entries(headers)) event.responseHeaders[name] = String(value)
})
vi.stubGlobal('setResponseHeader', (event: FakeEvent, name: string, value: string | number) => {
  event.responseHeaders[name] = String(value)
})
vi.stubGlobal('setResponseStatus', (event: FakeEvent, status: number, statusText?: string) => {
  event.responseStatus = status
  event.responseStatusText = statusText
})
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string, message?: string }) =>
  Object.assign(new Error(options.message ?? options.statusMessage), options),
)
vi.stubGlobal('env', { TRUSTED_PROXY_IP: undefined })
vi.stubGlobal('fetch', fetchMock)

const { default: handler } = await import('../../server/routes/ingest/[...path]') as {
  default: (event: FakeEvent) => Promise<Uint8Array>
}
const { holdAnalyticsProxyLeaseUntilResponse } = await import('../../server/utils/analyticsProxyConcurrency')

function makeEvent(overrides: Partial<FakeEvent> = {}): FakeEvent {
  const base: FakeEvent = {
    method: 'POST',
    path: 'e',
    url: 'https://careers.thefactoryhq.com/ingest/e',
    socketIp: '198.51.100.10',
    requestHeaders: {
      'content-length': '2',
      'content-type': 'application/json',
    },
    responseHeaders: {},
    node: {
      req: makeRequestStream([new Uint8Array([123, 125])]),
      res: {
        once(event, listener) {
          if (event === 'finish') queueMicrotask(listener)
        },
      },
    },
  }
  return {
    ...base,
    ...overrides,
    node: { ...base.node, ...overrides.node },
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
})

describe('PostHog ingest route adapter', () => {
  it('destroys a stalled downstream response and releases its lease at the request deadline', () => {
    const timeout = new AbortController()
    const release = vi.fn()
    const destroy = vi.fn()
    const listeners = new Map<string, () => void>()
    const response = {
      once: (event: string, listener: () => void) => listeners.set(event, listener),
      removeListener: (event: string) => listeners.delete(event),
      destroy,
    }

    holdAnalyticsProxyLeaseUntilResponse(response, timeout.signal, release)
    timeout.abort()

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
    listeners.get('close')?.()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('rejects an unknown path without calling upstream', async () => {
    const event = makeEvent({ path: 'api/projects', url: 'https://careers.thefactoryhq.com/ingest/api/projects' })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(event.node.req.consumedChunks).toBe(0)
    expect(event.node.req.resume).toHaveBeenCalledTimes(1)
  })

  it('rejects a capture request without Content-Length before calling upstream', async () => {
    const event = makeEvent({ requestHeaders: {} })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 411 })
    expect(event.responseHeaders['X-RateLimit-Limit']).toBe('120')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(event.node.req.consumedChunks).toBe(0)
    expect(event.node.req.resume).toHaveBeenCalledTimes(1)
  })

  it('stops retaining and drains a chunked request stream as soon as its actual body crosses 1 MiB', async () => {
    const requestStream = makeRequestStream([
      new Uint8Array(700 * 1024),
      new Uint8Array(400 * 1024),
      new Uint8Array(10),
    ])
    const event = makeEvent({
      requestHeaders: { 'content-length': '1' },
      node: { req: requestStream },
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 })
    expect(requestStream.destroy).not.toHaveBeenCalled()
    expect(requestStream.resume).toHaveBeenCalledTimes(1)
    expect(requestStream.consumedChunks).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adapts a capture request with repeated query values and the ingestion limiter', async () => {
    const event = makeEvent({
      url: 'https://careers.thefactoryhq.com/ingest/e?ip=one&ip=two',
      requestHeaders: {
        'content-length': '2',
        'content-type': 'application/json',
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        'cf-ray': 'secret',
        'x-forwarded-for': '203.0.113.7',
      },
    })

    const body = await handler(event)

    const [target, init] = fetchMock.mock.calls[0]!
    expect(target).toBe('https://eu.i.posthog.com/e?ip=one&ip=two')
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' })
    expect(Object.fromEntries((init.headers as Headers).entries())).toEqual({ 'content-type': 'application/json' })
    expect(event.responseHeaders['X-RateLimit-Limit']).toBe('120')
    expect(event.responseStatus).toBe(200)
    expect(event.responseHeaders['content-type']).toBe('application/json')
    expect(new TextDecoder().decode(body)).toBe('{}')
  })

  it('does not make honest Cloudflare clients on one Render socket share the per-client budget', async () => {
    const socketIp = '10.0.0.9'
    for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
      await handler(makeEvent({
        socketIp,
        requestHeaders: {
          'content-length': '2',
          'cf-connecting-ip': '203.0.113.20',
        },
      }))
    }

    const secondClient = makeEvent({
      socketIp,
      requestHeaders: {
        'content-length': '2',
        'cf-connecting-ip': '203.0.113.21',
      },
    })
    await expect(handler(secondClient)).resolves.toBeInstanceOf(Buffer)
    expect(secondClient.responseHeaders['X-RateLimit-Limit']).toBe('120')

    const rejectedStream = makeRequestStream([new Uint8Array([123, 125])])
    const rejected = makeEvent({
      socketIp,
      requestHeaders: {
        'content-length': '2',
        'cf-connecting-ip': '203.0.113.20',
      },
      node: { req: rejectedStream },
    })
    const fetchCountBeforeRejection = fetchMock.mock.calls.length
    await expect(handler(rejected)).rejects.toMatchObject({ statusCode: 429 })
    expect(rejectedStream.resume).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(fetchCountBeforeRejection)
  })

  it('routes static HEAD requests through the assets host and higher asset limiter without reading a body', async () => {
    const event = makeEvent({
      method: 'HEAD',
      path: 'static/1.390.0/exception-autocapture.js',
      url: 'https://careers.thefactoryhq.com/ingest/static/1.390.0/exception-autocapture.js?v=1',
      requestHeaders: { accept: 'application/javascript' },
    })

    await handler(event)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://eu-assets.i.posthog.com/static/1.390.0/exception-autocapture.js?v=1',
      expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
    )
    expect(event.responseHeaders['X-RateLimit-Limit']).toBe('600')
    expect(event.node.req.consumedChunks).toBe(0)
  })

  it('drains and rejects bodies on GET asset requests before upstream fetch', async () => {
    const requestStream = makeRequestStream([new Uint8Array([1])])
    const event = makeEvent({
      method: 'GET',
      path: 'static/exception-autocapture.js',
      url: 'https://careers.thefactoryhq.com/ingest/static/exception-autocapture.js',
      requestHeaders: { 'content-length': '1' },
      node: { req: requestStream },
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(requestStream.resume).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps buffered proxy responses until slow downstream responses finish', async () => {
    const lifecycles = Array.from({ length: 33 }, () => makeResponseLifecycle())

    for (let index = 0; index < 32; index += 1) {
      const event = makeEvent({
        socketIp: `198.51.100.${index + 1}`,
        node: {
          req: makeRequestStream([new Uint8Array([123, 125])]),
          res: lifecycles[index]!.response,
        },
      })
      await expect(handler(event)).resolves.toBeInstanceOf(Buffer)
    }

    const saturated = makeEvent({
      socketIp: '203.0.113.250',
      node: {
        req: makeRequestStream([new Uint8Array([123, 125])]),
        res: lifecycles[32]!.response,
      },
    })
    await expect(handler(saturated)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(32)
    expect(saturated.node.req.resume).toHaveBeenCalledTimes(1)

    lifecycles[0]!.emit('finish')
    await expect(handler(saturated)).resolves.toBeInstanceOf(Buffer)

    for (const lifecycle of lifecycles) lifecycle.emit('finish')
  })

  it('releases buffered-response capacity when downstream closes early', async () => {
    const lifecycles = Array.from({ length: 33 }, () => makeResponseLifecycle())
    for (let index = 0; index < 32; index += 1) {
      await handler(makeEvent({
        socketIp: `192.0.2.${index + 1}`,
        node: {
          req: makeRequestStream([new Uint8Array([123, 125])]),
          res: lifecycles[index]!.response,
        },
      }))
    }

    lifecycles[0]!.emit('close')
    await expect(handler(makeEvent({
      socketIp: '192.0.2.200',
      node: {
        req: makeRequestStream([new Uint8Array([123, 125])]),
        res: lifecycles[32]!.response,
      },
    }))).resolves.toBeInstanceOf(Buffer)

    for (const lifecycle of lifecycles) lifecycle.emit('close')
  })

  it('releases concurrency capacity after an execution error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('upstream private detail'))
    await expect(handler(makeEvent({ socketIp: '198.18.0.1' })))
      .rejects.toMatchObject({ statusCode: 502, message: 'Analytics upstream request failed' })

    await expect(handler(makeEvent({ socketIp: '198.18.0.2' }))).resolves.toBeInstanceOf(Buffer)
  })
})
