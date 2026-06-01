import type { Ref } from 'vue'
import { computed, nextTick, ref } from 'vue'

type UseMenuButtonOptions = {
  id: string
  triggerRef?: Ref<HTMLElement | null>
  menuRef?: Ref<HTMLElement | null>
  closeOnOutside?: boolean
  focusOnOpen?: boolean
}

type OpenMenuOptions = {
  focus?: boolean | 'first' | 'last'
}

export function useMenuButton(options: UseMenuButtonOptions) {
  const isOpen = ref(false)
  const triggerRef = options.triggerRef ?? ref<HTMLElement | null>(null)
  const menuRef = options.menuRef ?? ref<HTMLElement | null>(null)
  const focusOnOpen = options.focusOnOpen ?? true

  function focusTrigger() {
    triggerRef.value?.focus()
  }

  function getMenuItems() {
    const selector = [
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      'a[href]',
      'button:not([disabled])',
    ].join(',')

    return Array.from(menuRef.value?.querySelectorAll<HTMLElement>(selector) ?? [])
      .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
  }

  function focusMenuItem(index: number) {
    const items = getMenuItems()
    if (!items.length) return
    const nextIndex = (index + items.length) % items.length
    items[nextIndex]?.focus()
  }

  function focusFirstMenuItem() {
    focusMenuItem(0)
  }

  function focusLastMenuItem() {
    const items = getMenuItems()
    if (!items.length) return
    focusMenuItem(items.length - 1)
  }

  async function openMenu(openOptions: OpenMenuOptions = {}) {
    isOpen.value = true
    const focus = openOptions.focus ?? focusOnOpen
    if (!focus) return

    await nextTick()
    if (focus === 'last') focusLastMenuItem()
    else focusFirstMenuItem()
  }

  function closeMenu(options: { restoreFocus?: boolean } = {}) {
    if (!isOpen.value) return
    isOpen.value = false
    if (options.restoreFocus) focusTrigger()
  }

  function toggleMenu() {
    if (isOpen.value) closeMenu()
    else openMenu()
  }

  function focusAdjacentMenuItem(direction: 1 | -1) {
    const items = getMenuItems()
    if (items.length === 0) return
    const currentIndex = items.findIndex(item => item === document.activeElement)
    const nextIndex = currentIndex < 0
      ? direction === 1 ? 0 : items.length - 1
      : (currentIndex + direction + items.length) % items.length
    items[nextIndex]?.focus()
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      openMenu({ focus: 'first' })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu({ focus: 'last' })
    } else if (event.key === 'Escape') {
      closeMenu({ restoreFocus: true })
    }
  }

  function onMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu({ restoreFocus: true })
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusAdjacentMenuItem(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusAdjacentMenuItem(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusFirstMenuItem()
    } else if (event.key === 'End') {
      event.preventDefault()
      focusLastMenuItem()
    } else if (event.key === 'Tab') {
      closeMenu({ restoreFocus: true })
    }
  }

  if (options.closeOnOutside ?? true) {
    useOutsidePointer({
      root: [triggerRef, menuRef],
      active: isOpen,
      onOutside: () => closeMenu(),
    })
  }

  const triggerAttrs = computed(() => ({
    'aria-haspopup': 'menu' as const,
    'aria-expanded': isOpen.value,
    'aria-controls': options.id,
  }))

  return {
    isOpen,
    triggerRef,
    menuRef,
    triggerAttrs,
    openMenu,
    closeMenu,
    toggleMenu,
    focusTrigger,
    focusFirstMenuItem,
    focusLastMenuItem,
    onTriggerKeydown,
    onMenuKeydown,
  }
}
