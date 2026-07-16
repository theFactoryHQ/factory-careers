import { once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AnalyticsProxyError,
  MAX_ANALYTICS_REQUEST_BYTES,
  readBoundedAnalyticsRequestBody,
} from '../../server/utils/analyticsProxyPolicy'

const openServers = new Set<ReturnType<typeof createServer>>()

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

  it('returns HTTP 413 without resetting a chunked Node client connection', async () => {
    let requestDestroyedAtLimit: boolean | undefined
    const server = createServer(async (incoming, response) => {
      try {
        await readBoundedAnalyticsRequestBody(incoming, MAX_ANALYTICS_REQUEST_BYTES)
        response.statusCode = 204
      }
      catch (error) {
        requestDestroyedAtLimit = incoming.destroyed
        response.statusCode = error instanceof AnalyticsProxyError ? error.statusCode : 500
      }
      response.setHeader('Connection', 'close')
      response.end()
    })
    openServers.add(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    const { port } = server.address() as AddressInfo
    const result = await new Promise<{ statusCode?: number, body: string }>((resolve, reject) => {
      const clientRequest = httpRequest({
        host: '127.0.0.1',
        port,
        method: 'POST',
        agent: false,
        headers: { 'transfer-encoding': 'chunked' },
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }))
      })
      clientRequest.on('error', reject)

      for (let chunk = 0; chunk < 20; chunk += 1) {
        clientRequest.write(Buffer.alloc(64 * 1024, 1))
      }
      clientRequest.end()
    })

    expect(result).toEqual({ statusCode: 413, body: '' })
    expect(requestDestroyedAtLimit).toBe(false)
  })
})
