import type { MaybeRefOrGetter } from 'vue'
import { onBeforeUnmount, toValue, watch } from 'vue'

type MaybeElement = HTMLElement | null | undefined

type UseOutsidePointerOptions = {
  root: MaybeRefOrGetter<MaybeElement> | Array<MaybeRefOrGetter<MaybeElement>>
  active?: MaybeRefOrGetter<boolean>
  eventName?: 'click' | 'mousedown' | 'pointerdown'
  capture?: boolean
  onOutside: (event: MouseEvent | PointerEvent) => void
}

export function useOutsidePointer(options: UseOutsidePointerOptions) {
  const eventName = options.eventName ?? 'pointerdown'
  const capture = options.capture ?? true
  const roots = Array.isArray(options.root) ? options.root : [options.root]

  function isActive() {
    return options.active == null ? true : toValue(options.active)
  }

  function containsTarget(target: EventTarget | null) {
    if (!(target instanceof Node)) return false
    return roots.some((root) => {
      const el = toValue(root)
      return el ? el.contains(target) : false
    })
  }

  function onDocumentPointer(event: MouseEvent | PointerEvent) {
    if (!isActive() || containsTarget(event.target)) return
    options.onOutside(event)
  }

  function addListener() {
    if (typeof document === 'undefined') return
    document.addEventListener(eventName, onDocumentPointer as EventListener, capture)
  }

  function removeListener() {
    if (typeof document === 'undefined') return
    document.removeEventListener(eventName, onDocumentPointer as EventListener, capture)
  }

  watch(
    () => isActive(),
    (active) => {
      removeListener()
      if (active) addListener()
    },
    { immediate: true },
  )

  onBeforeUnmount(removeListener)

  return {
    onDocumentPointer,
  }
}
