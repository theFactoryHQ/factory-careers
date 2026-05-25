export function useColumnVisibility<T extends Record<string, boolean>>(scope: string, defaults: T) {
  const storageKey = `reqcore:columns:${scope}`
  const visibleColumns = ref<Record<string, boolean>>({ ...defaults })

  onMounted(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) visibleColumns.value = mergeSanitizedColumnVisibility(defaults, JSON.parse(raw))
    }
    catch {
      // ignore corrupt or unavailable storage
    }
  })

  watch(visibleColumns, (value) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    }
    catch {
      // ignore quota or unavailable storage
    }
  }, { deep: true })

  function mergeColumnVisibility(value?: Record<string, boolean>) {
    visibleColumns.value = mergeSanitizedColumnVisibility(defaults, value)
  }

  return {
    visibleColumns,
    mergeColumnVisibility,
  }
}

export function mergeSanitizedColumnVisibility(
  defaults: Record<string, boolean>,
  value: unknown,
): Record<string, boolean> {
  if (!isPlainObject(value)) return { ...defaults }

  const sanitized: Record<string, boolean> = {}
  for (const [key, isVisible] of Object.entries(value)) {
    if (typeof isVisible !== 'boolean') continue
    if (!(key in defaults) && !key.startsWith('prop_')) continue
    sanitized[key] = isVisible
  }

  return { ...defaults, ...sanitized }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
