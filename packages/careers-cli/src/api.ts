import { normalizeCliError } from './errors'

export type FetchLike = typeof fetch

export async function requestJson<T>(options: {
  fetch: FetchLike
  url: string
  method?: string
  body?: unknown
  token?: string
  signal?: AbortSignal
}): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await options.fetch(options.url, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
  const data = await response.json().catch(() => null) as unknown

  if (!response.ok) {
    throw normalizeCliError({
      ...(data && typeof data === 'object' ? data : {}),
      status: response.status,
    })
  }

  return data as T
}

export async function requestFormJson<T>(options: {
  fetch: FetchLike
  url: string
  method?: string
  form: FormData
  token?: string
}): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await options.fetch(options.url, {
    method: options.method ?? 'POST',
    headers,
    body: options.form,
  })
  const data = await response.json().catch(() => null) as unknown

  if (!response.ok) {
    throw normalizeCliError({
      ...(data && typeof data === 'object' ? data : {}),
      status: response.status,
    })
  }

  return data as T
}

export async function requestBinary(options: {
  fetch: FetchLike
  url: string
  method?: string
  token?: string
}): Promise<{
  bytes: Uint8Array
  contentType?: string
}> {
  const headers: Record<string, string> = {}

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await options.fetch(options.url, {
    method: options.method ?? 'GET',
    headers,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null) as unknown
    throw normalizeCliError({
      ...(data && typeof data === 'object' ? data : {}),
      status: response.status,
    })
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? undefined,
  }
}

export async function requestText(options: {
  fetch: FetchLike
  url: string
  method?: string
  body?: unknown
  token?: string
}): Promise<string> {
  const headers: Record<string, string> = {
    accept: 'text/event-stream, text/plain',
  }

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await options.fetch(options.url, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null) as unknown
    throw normalizeCliError({
      ...(data && typeof data === 'object' ? data : {}),
      status: response.status,
    })
  }

  return response.text()
}
