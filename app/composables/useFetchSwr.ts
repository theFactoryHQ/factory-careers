import type { Ref } from 'vue'

export const DEFAULT_FETCH_SWR_TTL_MS = 45_000

export type SwrStamped = {
  _fetchedAt?: number
}

/** Stamp the first successful fetch time on a useFetch payload entry. */
export function attachFetchSwrStamp<T>(data: T | null | undefined) {
  if (!data) return
  const stamped = data as T & SwrStamped
  if (!stamped._fetchedAt) {
    stamped._fetchedAt = Date.now()
  }
}

type SwrCacheContext = {
  cause?: 'initial' | 'refresh:hook' | 'refresh:manual' | 'watch'
}

/** Serve cached useFetch payload instantly within TTL, then allow background refresh. */
export function getSwrCachedData<T>(
  key: string,
  nuxtApp: ReturnType<typeof useNuxtApp>,
  context?: SwrCacheContext,
  ttlMs = DEFAULT_FETCH_SWR_TTL_MS,
): T | undefined {
  // Explicit refreshes must hit the network — returning cache here would noop refresh().
  if (context?.cause === 'refresh:manual' || context?.cause === 'refresh:hook') {
    return undefined
  }

  const cached = nuxtApp.payload.data[key] as (T & SwrStamped) | undefined
  if (!cached) return undefined

  const fetchedAt = cached._fetchedAt || 0
  if (Date.now() - fetchedAt < ttlMs) {
    return cached
  }

  return cached
}

/** Watch a useFetch data ref and stamp successful payloads on the client. */
export function watchFetchSwrStamp<T>(data: Ref<T | null | undefined>) {
  if (import.meta.client) {
    watch(data, (val) => {
      attachFetchSwrStamp(val)
    }, { immediate: true })
  }
}