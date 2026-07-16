import { once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
  AnalyticsProxyError,
  MAX_ANALYTICS_REQUEST_BYTES,
  readBoundedAnalyticsRequestBody,
} from '../../server/utils/analyticsProxyPolicy'

const openServers = new Set<ReturnType<typeof createServer>>()

type RouteEvent = {
  method: string
  path: string
  url: string
  requestHeaders: Record<string, string | string[] | undefined>
  responseStatus?: number
  responseStatusText?: string
  node: {
    req: Parameters<Parameters<typeof createServer>[0]>[0]
    res: Parameters<Parameters<typeof createServer>[0]>[1]
  }
}

const routeFetchMock = vi.fn(async () => new Response('{}', {
  status: 200,
  headers: { 'content-type': 'application/json' },
}))
const routeTimeoutControllers: AbortController[] = []
const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
  const controller = new AbortController()
  routeTimeoutControllers.push(controller)
  return controller.signal
})
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: RouteEvent) => event.path)
vi.stubGlobal('getRequestURL', (event: RouteEvent) => new URL(event.url))
vi.stubGlobal('getRequestHeaders', (event: RouteEvent) => event.requestHeaders)
vi.stubGlobal('getRequestIP', (event: RouteEvent) => event.node.req.socket.remoteAddress)
vi.stubGlobal('getHeader', (event: RouteEvent, name: string) => event.requestHeaders[name.toLowerCase()])
vi.stubGlobal('setResponseHeaders', (event: RouteEvent, headers: Record<string, string | number>) => {
  for (const [name, value] of Object.entries(headers)) event.node.res.setHeader(name, String(value))
})
vi.stubGlobal('setResponseHeader', (event: RouteEvent, name: string, value: string | number) => {
  event.node.res.setHeader(name, String(value))
})
vi.stubGlobal('setResponseStatus', (event: RouteEvent, status: number, statusText?: string) => {
  event.responseStatus = status
  event.responseStatusText = statusText
})
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage?: string, message?: string }) =>
  Object.assign(new Error(options.message ?? options.statusMessage), options),
)
vi.stubGlobal('env', { TRUSTED_PROXY_IP: undefined })
vi.stubGlobal('fetch', routeFetchMock)

const { default: analyticsRouteHandler } = await import('../../server/routes/ingest/[...path]') as {
  default: (event: RouteEvent) => Promise<Uint8Array>
}

afterAll(() => timeoutSpy.mockRestore())

async function startAnalyticsRouteServer() {
  const server = createServer(async (incoming, response) => {
    const event: RouteEvent = {
      method: incoming.method ?? 'GET',
      path: incoming.url?.split('?', 1)[0]?.replace(/^\/ingest\//, '') ?? '',
      url: `http://127.0.0.1${incoming.url ?? '/'}`,
      requestHeaders: incoming.headers,
      node: { req: incoming, res: response },
    }
    try {
      const body = await analyticsRouteHandler(event)
      response.statusCode = event.responseStatus ?? 200
      if (event.responseStatusText) response.statusMessage = event.responseStatusText
      response.end(body)
    }
    catch (error) {
      response.statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 500
      response.end()
    }
  })
  openServers.add(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return (server.address() as AddressInfo).port
}

async function sendRequest(options: {
  port: number
  method: string
  path?: string
  headers?: Record<string, string>
  chunks?: Buffer[]
}) {
  return await new Promise<{ statusCode?: number, body: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for HTTP policy response')), 2_000)
    const clientRequest = httpRequest({
      host: '127.0.0.1',
      port: options.port,
      path: options.path ?? '/ingest/e',
      method: options.method,
      agent: false,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        clearTimeout(timeout)
        resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    clientRequest.on('error', (error: NodeJS.ErrnoException) => {
      // The server may finish an early policy response while Node is still
      // flushing already-buffered upload bytes. Preserve that response; fail
      // only if it never arrives or the error is unrelated.
      if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') {
        clearTimeout(timeout)
        reject(error)
      }
    })
    for (const chunk of options.chunks ?? []) clientRequest.write(chunk)
    clientRequest.end()
  })
}

afterEach(async () => {
  await Promise.all([...openServers].map(async (server) => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    openServers.delete(server)
  }))
})

describe('bounded analytics request stream', () => {
  it('releases and drains after a non-policy iterator read error without masking the 400', async () => {
    const releaseIterator = vi.fn(async () => ({ done: true, value: undefined }))
    const resume = vi.fn()
    const stream = {
      iterator: () => ({
        next: vi.fn(async () => { throw new Error('socket read detail') }),
        return: releaseIterator,
      }),
      resume,
      async *[Symbol.asyncIterator]() {},
    }

    await expect(readBoundedAnalyticsRequestBody(stream)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Unable to read analytics request body',
    })
    expect(releaseIterator).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('reaches the 413 policy without destroying a chunked Node request socket', async () => {
    let resolveObserved: ((value: { statusCode: number, destroyed: boolean }) => void) | undefined
    const observed = new Promise<{ statusCode: number, destroyed: boolean }>((resolve) => {
      resolveObserved = resolve
    })
    const server = createServer(async (incoming, response) => {
      try {
        await readBoundedAnalyticsRequestBody(incoming, MAX_ANALYTICS_REQUEST_BYTES)
        response.statusCode = 204
      }
      catch (error) {
        response.statusCode = error instanceof AnalyticsProxyError ? error.statusCode : 500
        resolveObserved?.({ statusCode: response.statusCode, destroyed: incoming.destroyed })
      }
      response.setHeader('Connection', 'close')
      response.end()
    })
    openServers.add(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    const { port } = server.address() as AddressInfo
    const clientRequest = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      agent: false,
      headers: { 'transfer-encoding': 'chunked' },
    })
    clientRequest.on('error', () => undefined)
    for (let chunk = 0; chunk < 20; chunk += 1) {
      clientRequest.write(Buffer.alloc(64 * 1024, 1))
    }
    clientRequest.end()

    await expect(observed).resolves.toEqual({ statusCode: 413, destroyed: false })
    clientRequest.destroy()
  })

  it('drains a chunked missing-length request through the real route before returning 411', async () => {
    routeFetchMock.mockClear()
    const port = await startAnalyticsRouteServer()

    const result = await sendRequest({
      port,
      method: 'POST',
      headers: { 'transfer-encoding': 'chunked' },
      chunks: [Buffer.alloc(64 * 1024, 1)],
    })

    expect(result).toEqual({ statusCode: 411, body: '' })
    expect(routeFetchMock).not.toHaveBeenCalled()
  })

  it('drains a declared oversized request through the real route before returning 413', async () => {
    routeFetchMock.mockClear()
    const port = await startAnalyticsRouteServer()
    const body = Buffer.alloc(MAX_ANALYTICS_REQUEST_BYTES + 1, 1)

    const result = await sendRequest({
      port,
      method: 'POST',
      headers: { 'content-length': String(body.byteLength) },
      chunks: [body],
    })

    expect(result).toEqual({ statusCode: 413, body: '' })
    expect(routeFetchMock).not.toHaveBeenCalled()
  })

  it('returns 408 through the real route when a declared upload stalls', async () => {
    routeFetchMock.mockClear()
    const port = await startAnalyticsRouteServer()
    const controllerCount = routeTimeoutControllers.length

    const resultPromise = new Promise<{ statusCode?: number, body: string }>((resolve, reject) => {
      const clientRequest = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/ingest/e',
        method: 'POST',
        agent: false,
        headers: { 'content-length': '100' },
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          clientRequest.destroy()
          resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        })
      })
      clientRequest.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error)
      })
      clientRequest.write(Buffer.from([1]))
    })

    await vi.waitFor(() => expect(routeTimeoutControllers.length).toBe(controllerCount + 1))
    routeTimeoutControllers.at(-1)!.abort()

    await expect(resultPromise).resolves.toEqual({ statusCode: 408, body: '' })
    expect(routeFetchMock).not.toHaveBeenCalled()
  })

  it('drains an unknown-path body through the real route before returning 404', async () => {
    routeFetchMock.mockClear()
    const port = await startAnalyticsRouteServer()

    const result = await sendRequest({
      port,
      path: '/ingest/api/projects',
      method: 'POST',
      headers: { 'content-length': '2' },
      chunks: [Buffer.from('{}')],
    })

    expect(result).toEqual({ statusCode: 404, body: '' })
    expect(routeFetchMock).not.toHaveBeenCalled()
  })
})
