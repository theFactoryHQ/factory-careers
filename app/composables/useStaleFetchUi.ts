import { computed, toValue, type MaybeRefOrGetter } from 'vue'

type FetchStatus = 'idle' | 'pending' | 'success' | 'error'

/** Derive skeleton vs stale-while-revalidate UI from useFetch status + cached payload. */
export function useStaleFetchUi(
  fetchStatus: MaybeRefOrGetter<FetchStatus>,
  data: MaybeRefOrGetter<unknown>,
) {
  const showSkeleton = computed(() => {
    const status = toValue(fetchStatus)
    const payload = toValue(data)
    return status === 'pending' && (payload === null || payload === undefined)
  })

  const isRevalidating = computed(() => {
    const status = toValue(fetchStatus)
    const payload = toValue(data)
    return status === 'pending' && payload != null
  })

  return {
    showSkeleton,
    isRevalidating,
  }
}