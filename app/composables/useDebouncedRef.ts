import type { Ref } from 'vue'

type DebouncedRefOptions<T> = {
  delay?: number
  transform?: (value: string) => T
  initial?: T
}

/**
 * Debounce a string ref into a derived value. Used by dashboard search bars.
 */
export function useDebouncedRef<T>(
  source: Ref<string>,
  options: DebouncedRefOptions<T> = {},
) {
  const delay = options.delay ?? 300
  const transform = options.transform ?? ((value: string) => value as unknown as T)
  const debounced = ref(options.initial ?? transform(source.value)) as Ref<T>

  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = transform(value)
    }, delay)
  })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return debounced
}