import { toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'

type FloatingMenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

type FloatingMenuOptions = {
  open: Readonly<Ref<boolean>>
  triggerRef: Readonly<Ref<HTMLElement | null>>
  placement?: MaybeRefOrGetter<FloatingMenuPlacement>
  width?: number | 'trigger'
  gap?: number
  viewportPadding?: number
  estimatedHeight?: number
  zIndex?: number
}

export function useFloatingMenu(options: FloatingMenuOptions) {
  const floatingStyle = ref<Record<string, string>>({})

  function updateFloatingPosition() {
    if (!import.meta.client || !options.open.value || !options.triggerRef.value) return

    const rect = options.triggerRef.value.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const gap = options.gap ?? 4
    const viewportPadding = options.viewportPadding ?? 8
    const estimatedHeight = options.estimatedHeight ?? 280
    const width = options.width === 'trigger' || options.width == null
      ? rect.width
      : options.width
    const placement = toValue(options.placement) ?? 'bottom-start'
    const preferredLeft = placement === 'bottom-end' ? rect.right - width : rect.left
    const left = Math.min(
      Math.max(viewportPadding, preferredLeft),
      viewportWidth - width - viewportPadding,
    )
    const prefersTop = placement.startsWith('top')
    const renderAbove = prefersTop || (
      rect.bottom + gap + estimatedHeight > viewportHeight &&
      rect.top > estimatedHeight
    )

    floatingStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      width: `${width}px`,
      zIndex: String(options.zIndex ?? 80),
      ...(renderAbove
        ? { bottom: `${Math.max(viewportPadding, viewportHeight - rect.top + gap)}px` }
        : { top: `${rect.bottom + gap}px` }),
    }
  }

  watch(
    () => options.open.value,
    async (isOpen) => {
      if (!isOpen) return
      await nextTick()
      updateFloatingPosition()
    },
  )

  if (import.meta.client) {
    const onReposition = () => updateFloatingPosition()

    watchEffect((onCleanup) => {
      if (!options.open.value) return
      window.addEventListener('resize', onReposition)
      window.addEventListener('scroll', onReposition, true)
      onCleanup(() => {
        window.removeEventListener('resize', onReposition)
        window.removeEventListener('scroll', onReposition, true)
      })
    })
  }

  return {
    floatingStyle,
    updateFloatingPosition,
  }
}
