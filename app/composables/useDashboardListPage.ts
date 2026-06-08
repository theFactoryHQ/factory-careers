type UseDashboardListPageOptions<TSearch> = {
  debounceMs?: number
  normalizeSearch?: (value: string) => TSearch
  initialSearch?: TSearch
}

/**
 * Shared orchestration for dashboard list pages: debounced search, filter drawer,
 * and fullscreen table mode with Escape-to-exit behavior.
 */
export function useDashboardListPage<TSearch = string | undefined>(
  options: UseDashboardListPageOptions<TSearch> = {},
) {
  const normalizeSearch = options.normalizeSearch
    ?? ((value: string) => (value.trim() || undefined) as TSearch)

  const searchInput = ref('')
  const debouncedSearch = useDebouncedRef(searchInput, {
    delay: options.debounceMs ?? 300,
    transform: normalizeSearch,
    initial: options.initialSearch ?? normalizeSearch(''),
  })

  const drawerOpen = ref(false)
  const isFullscreen = ref(false)

  function handleFullscreenKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isFullscreen.value) {
      isFullscreen.value = false
    }
  }

  onMounted(() => window.addEventListener('keydown', handleFullscreenKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleFullscreenKeydown))

  return {
    searchInput,
    debouncedSearch,
    drawerOpen,
    isFullscreen,
  }
}