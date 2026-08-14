import { randomUUID } from 'node:crypto'

interface StorageReadinessDependencies {
  key?: string
  timeoutMs?: number
  put: (key: string, signal: AbortSignal) => Promise<void>
  head: (key: string, signal: AbortSignal) => Promise<boolean>
  remove: (key: string, signal: AbortSignal) => Promise<void>
}

export async function probeStorageReadiness({
  key = `_healthchecks/${randomUUID()}.tmp`,
  timeoutMs = 10_000,
  put,
  head,
  remove,
}: StorageReadinessDependencies): Promise<string> {
  const operation = new AbortController()
  const timeout = setTimeout(() => operation.abort(new Error('Storage readiness probe timed out')), timeoutMs)
  let written = false

  try {
    await put(key, operation.signal)
    written = true
    if (!(await head(key, operation.signal))) throw new Error('Storage readiness object was not readable')
  }
  finally {
    clearTimeout(timeout)
    if (written) {
      const cleanup = new AbortController()
      const cleanupTimeout = setTimeout(() => cleanup.abort(new Error('Storage readiness cleanup timed out')), timeoutMs)
      try {
        await remove(key, cleanup.signal)
      }
      finally {
        clearTimeout(cleanupTimeout)
      }
    }
  }

  return key
}
