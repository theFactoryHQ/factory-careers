import type { MaybeRefOrGetter } from 'vue'
import { nextTick, onBeforeUnmount, toValue, watch } from 'vue'

type FocusTrapOptions = {
  root: MaybeRefOrGetter<HTMLElement | null | undefined>
  active: MaybeRefOrGetter<boolean>
  onEscape?: () => void
  focusFirst?: boolean
  restoreFocus?: boolean
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
}

export function useFocusTrap(options: FocusTrapOptions) {
  let previousFocus: HTMLElement | null = null
  const shouldFocusFirst = options.focusFirst ?? true
  const shouldRestoreFocus = options.restoreFocus ?? true

  function focusFirst() {
    const root = toValue(options.root)
    if (!root) return
    const first = getFocusable(root)[0] ?? root
    first.focus()
  }

  function restoreFocus() {
    if (!shouldRestoreFocus) return
    previousFocus?.focus()
    previousFocus = null
  }

  function onKeydown(event: KeyboardEvent) {
    if (!toValue(options.active)) return

    if (event.key === 'Escape') {
      options.onEscape?.()
      return
    }

    if (event.key !== 'Tab') return

    const root = toValue(options.root)
    if (!root) return
    const focusable = getFocusable(root)
    if (focusable.length === 0) {
      event.preventDefault()
      root.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement

    if (event.shiftKey && current === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  watch(
    () => toValue(options.active),
    async (active) => {
      if (typeof document === 'undefined') return
      if (active) {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        document.addEventListener('keydown', onKeydown)
        if (shouldFocusFirst) {
          await nextTick()
          focusFirst()
        }
      } else {
        document.removeEventListener('keydown', onKeydown)
        restoreFocus()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown)
    restoreFocus()
  })

  return {
    focusFirst,
    restoreFocus,
    onKeydown,
  }
}
