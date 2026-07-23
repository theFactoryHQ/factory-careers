import type { LookupAddress, LookupOptions } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici'
import {
  resolveSafeServerSideUrl,
  type ServerSideUrlLookup,
  type ServerSideUrlValidationOptions,
} from './serverSideUrl'

export type SafeOutboundDispatcher = Dispatcher

export interface SafeOutboundDispatcherOptions {
  connect: {
    lookup: LookupFunction
  }
}

type SafeOutboundFetchImpl = (
  input: string | URL | Request,
  init: RequestInit,
  dispatcher: SafeOutboundDispatcher,
) => Promise<Response>

export interface SafeOutboundFetchDependencies {
  lookup?: ServerSideUrlLookup
  createDispatcher?: (options: SafeOutboundDispatcherOptions) => SafeOutboundDispatcher
  fetchImpl?: SafeOutboundFetchImpl
}

function lookupError(hostname: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`No validated address is available for ${hostname}`), {
    code: 'ENOTFOUND',
    hostname,
  })
}

function selectAddresses(addresses: LookupAddress[], options: LookupOptions): LookupAddress[] {
  const requestedFamily = typeof options.family === 'number' ? options.family : 0
  return requestedFamily === 4 || requestedFamily === 6
    ? addresses.filter(address => address.family === requestedFamily)
    : addresses
}

function createBoundLookup(expectedHostname: string, addresses: LookupAddress[]): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname.toLowerCase().replace(/\.$/, '') !== expectedHostname) {
      callback(lookupError(hostname), '', 0)
      return
    }

    const selected = selectAddresses(addresses, options)
    if (selected.length === 0) {
      callback(lookupError(hostname), '', 0)
      return
    }

    if (options.all) {
      callback(null, selected)
      return
    }

    const first = selected[0]!
    callback(null, first.address, first.family)
  }
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

const defaultFetchImpl: SafeOutboundFetchImpl = async (input, init, dispatcher) => {
  return await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...init,
    dispatcher,
  } as Parameters<typeof undiciFetch>[1]) as unknown as Response
}

/**
 * Creates an isolated server-side fetch that resolves and validates the target
 * once, then restricts this request's dispatcher to those exact addresses.
 *
 * The original URL remains unchanged, so Undici preserves the HTTP Host header,
 * TLS certificate hostname verification, and SNI. Redirects are always rejected.
 */
export function createSafeOutboundFetch(
  dependencies: SafeOutboundFetchDependencies = {},
  validationOptions: ServerSideUrlValidationOptions = {},
): typeof fetch {
  const lookupImpl = dependencies.lookup
  const createDispatcher = dependencies.createDispatcher
    ?? (options => new Agent(options))
  const fetchImpl = dependencies.fetchImpl ?? defaultFetchImpl

  return async (input, init = {}) => {
    const resolved = await resolveSafeServerSideUrl(
      requestUrl(input),
      validationOptions,
      lookupImpl,
    )
    const hostname = resolved.url.hostname
      .toLowerCase()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/\.$/, '')
    const dispatcher = createDispatcher({
      connect: {
        lookup: createBoundLookup(hostname, resolved.addresses),
      },
    })

    try {
      const response = await fetchImpl(input, {
        ...init,
        redirect: 'error',
      }, dispatcher)

      if (isRedirectStatus(response.status) || response.redirected) {
        await response.body?.cancel()
        throw createError({
          statusCode: 422,
          statusMessage: 'Outbound request redirects are not allowed',
        })
      }

      return response
    } finally {
      void dispatcher.close()
    }
  }
}

export const safeOutboundFetch = createSafeOutboundFetch()
