import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSafeOutboundFetch,
  type SafeOutboundDispatcher,
  type SafeOutboundDispatcherOptions,
} from '../../server/utils/safeOutboundFetch'

function makeError(opts: { statusCode: number, statusMessage?: string, cause?: unknown }) {
  return Object.assign(new Error(opts.statusMessage), opts)
}

interface HarnessOptions {
  addresses?: LookupAddress[]
  response?: Response
}

function createHarness(options: HarnessOptions = {}) {
  const addresses = options.addresses ?? [{ address: '203.0.113.10', family: 4 }]
  const lookup = vi.fn(async () => addresses)
  const close = vi.fn(async () => {})
  let dispatcherOptions: SafeOutboundDispatcherOptions | undefined

  const dispatcher = { close } as unknown as SafeOutboundDispatcher
  const createDispatcher = vi.fn((nextOptions: SafeOutboundDispatcherOptions) => {
    dispatcherOptions = nextOptions
    return dispatcher
  })
  const fetchImpl = vi.fn(async () => options.response ?? Response.json({ ok: true }))

  const safeFetch = createSafeOutboundFetch({
    lookup,
    createDispatcher,
    fetchImpl,
  })

  return {
    safeFetch,
    lookup,
    close,
    createDispatcher,
    fetchImpl,
    getDispatcherOptions: () => dispatcherOptions,
  }
}

function callBoundLookup(
  lookup: LookupFunction,
  hostname: string,
  options: Parameters<LookupFunction>[1],
): Promise<string | LookupAddress | LookupAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, options, (error, address, family) => {
      if (error) {
        reject(error)
        return
      }

      if (Array.isArray(address)) {
        resolve(address)
        return
      }

      resolve(typeof address === 'string' ? { address, family } : address)
    })
  })
}

beforeEach(() => {
  vi.stubGlobal('createError', makeError)
})

describe('safe outbound fetch', () => {
  it('binds the connection lookup to the public address validated for this request', async () => {
    const harness = createHarness()

    await harness.safeFetch('https://llm.example.com/v1/models')

    expect(harness.lookup).toHaveBeenCalledTimes(1)
    expect(harness.lookup).toHaveBeenCalledWith('llm.example.com', { all: true, verbatim: true })

    const boundLookup = harness.getDispatcherOptions()?.connect.lookup
    expect(boundLookup).toBeTypeOf('function')
    await expect(callBoundLookup(boundLookup!, 'llm.example.com', { all: true })).resolves.toEqual([
      { address: '203.0.113.10', family: 4 },
    ])
    expect(harness.fetchImpl).toHaveBeenCalledWith(
      'https://llm.example.com/v1/models',
      expect.objectContaining({ redirect: 'error' }),
      expect.anything(),
    )
  })

  it('rejects a mixed public/private DNS answer set before connecting', async () => {
    const harness = createHarness({
      addresses: [
        { address: '203.0.113.10', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    })

    await expect(harness.safeFetch('https://llm.example.com/v1/models'))
      .rejects.toThrow(/resolves to a local, private/i)
    expect(harness.createDispatcher).not.toHaveBeenCalled()
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects blocked literal addresses without DNS or fetch', async () => {
    const harness = createHarness()

    for (const url of [
      'https://127.0.0.1/',
      'https://10.0.0.5/',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://[fe80::1]/',
    ]) {
      await expect(harness.safeFetch(url)).rejects.toThrow(/must not target/i)
    }

    expect(harness.lookup).not.toHaveBeenCalled()
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps IPv4 and IPv6 answers available without performing another DNS lookup', async () => {
    const harness = createHarness({
      addresses: [
        { address: '203.0.113.10', family: 4 },
        { address: '2001:4860:4860::8888', family: 6 },
      ],
    })

    await harness.safeFetch('https://dual-stack.example.com/resource')

    const boundLookup = harness.getDispatcherOptions()?.connect.lookup
    await expect(callBoundLookup(boundLookup!, 'dual-stack.example.com', { all: true })).resolves.toEqual([
      { address: '203.0.113.10', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ])
    await expect(callBoundLookup(boundLookup!, 'dual-stack.example.com', { family: 6 }))
      .resolves.toEqual({ address: '2001:4860:4860::8888', family: 6 })
    expect(harness.lookup).toHaveBeenCalledTimes(1)
  })

  it('preserves the original HTTPS hostname for Host, certificate checks, and SNI', async () => {
    const harness = createHarness()

    await harness.safeFetch('https://tenant-idp.example.com/.well-known/openid-configuration')

    expect(harness.fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://tenant-idp.example.com/.well-known/openid-configuration',
    )
    expect(harness.getDispatcherOptions()).toEqual({
      connect: { lookup: expect.any(Function) },
    })
    expect(harness.getDispatcherOptions()?.connect).not.toHaveProperty('servername')
    expect(harness.getDispatcherOptions()?.connect).not.toHaveProperty('rejectUnauthorized')
  })

  it('rejects redirect responses even when an injected fetch ignores redirect:error', async () => {
    const harness = createHarness({
      response: new Response(null, {
        status: 302,
        headers: { Location: 'https://127.0.0.1/internal' },
      }),
    })

    await expect(harness.safeFetch('https://public.example.com/start'))
      .rejects.toThrow(/redirect/i)
  })

  it('preserves caller abort signals', async () => {
    const harness = createHarness()
    const controller = new AbortController()

    await harness.safeFetch('https://llm.example.com/v1/models', {
      signal: controller.signal,
    })

    expect(harness.fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      signal: controller.signal,
    }))
  })

  it('allows explicit localhost HTTP only for local development callers', async () => {
    const harness = createHarness({
      addresses: [{ address: '127.0.0.1', family: 4 }],
    })

    await expect(harness.safeFetch('http://localhost:8080/discovery'))
      .rejects.toThrow(/must use https/i)

    const localFetch = createSafeOutboundFetch(
      {
        lookup: harness.lookup,
        createDispatcher: harness.createDispatcher,
        fetchImpl: harness.fetchImpl,
      },
      {
        allowedProtocols: ['https:', 'http:'],
        allowLocalhost: true,
      },
    )

    await expect(localFetch('http://localhost:8080/discovery')).resolves.toBeInstanceOf(Response)
  })

  it('rejects empty DNS answers instead of falling back to ordinary resolution', async () => {
    const harness = createHarness({ addresses: [] })

    await expect(harness.safeFetch('https://empty.example.com/resource'))
      .rejects.toThrow(/could not be resolved safely/i)
    expect(harness.createDispatcher).not.toHaveBeenCalled()
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })
})
