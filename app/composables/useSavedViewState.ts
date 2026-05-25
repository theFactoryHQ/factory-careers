import type { ComputedRef } from 'vue'

export function savedViewSettingsEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  return stableStringify(a) === stableStringify(b)
}

export function useSavedViewState<T extends Record<string, unknown>>(
  scope: string,
  defaultSettings: T,
  currentSettings: ComputedRef<T>,
  applySettings: (settings: T) => void,
  options: {
    settingsEqual?: (a: T, b: T) => boolean
  } = {},
) {
  const savedViews = useSavedViews<T>(scope, defaultSettings)
  const settingsEqual = options.settingsEqual ?? savedViewSettingsEqual

  onMounted(() => {
    nextTick(() => {
      if (savedViews.activeViewId.value) {
        const settings = savedViews.applyView(savedViews.activeViewId.value)
        if (settings) applySettings(settings)
      }
    })
  })

  const isDirty = computed(() => {
    const view = savedViews.views.value.find(item => item.id === savedViews.activeViewId.value)
    if (!view) return false
    return !settingsEqual(currentSettings.value, { ...defaultSettings, ...view.settings })
  })

  function onSelectView(id: string | null) {
    if (id == null) {
      savedViews.clearActive()
      applySettings(defaultSettings)
      return
    }

    const settings = savedViews.applyView(id)
    if (settings) applySettings(settings)
  }

  function onSaveView(name: string) {
    savedViews.saveView(name, currentSettings.value)
  }

  function onUpdateView(id: string) {
    savedViews.updateView(id, { settings: currentSettings.value })
  }

  return {
    ...savedViews,
    isDirty,
    onSelectView,
    onSaveView,
    onUpdateView,
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'function') return 'function'
  if (typeof value === 'symbol') return `symbol:${String(value.description ?? '')}`
  if (typeof value === 'bigint') return `bigint:${value.toString()}`

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value) ?? String(value)
}
