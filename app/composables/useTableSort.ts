export type SortDir = 'asc' | 'desc'

type UseTableSortOptions<SortKey extends string> = {
  initialKey: SortKey
  initialDir?: SortDir
  /** Default direction when switching to a new sort column. */
  defaultDirForKey?: (key: SortKey) => SortDir
}

/**
 * Shared table sort state and accessible sort-button helpers for dashboard lists.
 */
export function useTableSort<SortKey extends string>(options: UseTableSortOptions<SortKey>) {
  const sortKey = ref(options.initialKey)
  const sortDir = ref(options.initialDir ?? 'desc')

  function toggleSort(key: SortKey) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
      return
    }

    sortKey.value = key
    sortDir.value = options.defaultDirForKey?.(key) ?? 'asc'
  }

  function getSortAria(key: SortKey): 'none' | 'ascending' | 'descending' {
    if (sortKey.value !== key) return 'none'
    return sortDir.value === 'asc' ? 'ascending' : 'descending'
  }

  function getSortButtonLabel(key: SortKey, label: string) {
    if (sortKey.value !== key) return `Sort by ${label}`
    const nextDirection = sortDir.value === 'asc' ? 'descending' : 'ascending'
    return `Sort by ${label} ${nextDirection}`
  }

  return {
    sortKey,
    sortDir,
    toggleSort,
    getSortAria,
    getSortButtonLabel,
  }
}