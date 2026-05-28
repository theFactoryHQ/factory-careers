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
  focus?: boolean
}

export function useMenuButton(options: UseMenuButtonOptions) {
  const isOpen = ref(false)
  const triggerRef = options.triggerRef ?? ref<HTMLElement | null>(null)
  const menuRef = options.menuRef ?? ref<HTMLElement | null>(null)
  const focusOnOpen = options.focusOnOpen ?? true

  function focusTrigger() {
    triggerRef.value?.focus()
  }

  function focusFirstMenuItem() {
    focusMenuItem(0)
  }

  function getMenuItems() {
    return Array.from(menuRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"], a[href], button:not([disabled])') ?? [])
  }

  function focusMenuItem(index: number) {
    const items = getMenuItems()
    if (!items.length) return
    const nextIndex = (index + items.length) % items.length
    items[nextIndex]?.focus()
  }

  async function openMenu(openOptions: OpenMenuOptions = {}) {
    isOpen.value = true
    const shouldFocus = openOptions.focus ?? focusOnOpen
    if (shouldFocus) {
      await nextTick()
      focusFirstMenuItem()
    }
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

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      openMenu({ focus: true })
    } else if (event.key === 'Escape') {
      closeMenu({ restoreFocus: true })
    }
  }

  function onMenuKeydown(event: KeyboardEvent) {
    const items = getMenuItems()
    const activeIndex = items.findIndex(item => item === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu({ restoreFocus: true })
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusMenuItem(activeIndex + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusMenuItem(activeIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusMenuItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusMenuItem(items.length - 1)
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
    'aria-haspopup': 'menu',
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
    onTriggerKeydown,
    onMenuKeydown,
  }
}
