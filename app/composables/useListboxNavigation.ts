import type { MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue, watch } from 'vue'

type UseListboxNavigationOptions = {
  idBase: MaybeRefOrGetter<string>
  open: MaybeRefOrGetter<boolean>
  optionCount: MaybeRefOrGetter<number>
  selectedIndex?: MaybeRefOrGetter<number>
  openListbox?: () => void
  closeListbox?: () => void
  selectIndex: (index: number) => void
}

export function useListboxNavigation(options: UseListboxNavigationOptions) {
  const activeIndex = ref(-1)

  const activeDescendantId = computed(() =>
    activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined
  )

  function optionId(index: number) {
    return `${toValue(options.idBase)}-option-${index}`
  }

  function clamp(index: number) {
    const count = toValue(options.optionCount)
    if (count <= 0) return -1
    if (index < 0) return count - 1
    if (index >= count) return 0
    return index
  }

  function currentSelectedIndex() {
    const selected = options.selectedIndex == null ? 0 : toValue(options.selectedIndex)
    return selected >= 0 ? selected : 0
  }

  function activate(index: number) {
    activeIndex.value = clamp(index)
  }

  function selectActive() {
    if (activeIndex.value < 0) return
    options.selectIndex(activeIndex.value)
  }

  function onKeydown(event: KeyboardEvent) {
    const open = toValue(options.open)
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      options.openListbox?.()
      activate(currentSelectedIndex())
      return
    }

    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activate(activeIndex.value + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activate(activeIndex.value - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      activate(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      activate(toValue(options.optionCount) - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectActive()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      options.closeListbox?.()
    }
  }

  watch(
    () => toValue(options.open),
    (open) => {
      if (open) activate(currentSelectedIndex())
      else activeIndex.value = -1
    },
  )

  return {
    activeIndex,
    activeDescendantId,
    optionId,
    activate,
    selectActive,
    onKeydown,
  }
}
