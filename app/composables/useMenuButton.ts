import type { Ref } from 'vue'
import { computed, nextTick, ref } from 'vue'

type UseMenuButtonOptions = {
  id: string
  triggerRef?: Ref<HTMLElement | null>
  menuRef?: Ref<HTMLElement | null>
  closeOnOutside?: boolean
  focusOnOpen?: boolean
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
    const first = menuRef.value?.querySelector<HTMLElement>('[role="menuitem"], a[href], button:not([disabled])')
    first?.focus()
  }

  async function openMenu() {
    isOpen.value = true
    if (focusOnOpen) {
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
      openMenu()
    } else if (event.key === 'Escape') {
      closeMenu({ restoreFocus: true })
    }
  }

  function onMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
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
