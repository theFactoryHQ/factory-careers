<script setup lang="ts">
/**
 * ChatbotPickerMenu
 *
 * Shared floating-menu shell for chatbot agent/model pickers. Owns trigger
 * button chrome, menu positioning, outside-click dismissal, and keyboard
 * navigation via useMenuButton + useFloatingMenu.
 */
import type { Component } from 'vue'
import { ChevronUp } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  id: string
  label: string
  icon: Component
  menuAriaLabel: string
  title?: string
  width?: number
  estimatedHeight?: number
  scrollable?: boolean
  labelMaxWidthClass?: string
}>(), {
  title: '',
  width: 256,
  estimatedHeight: 320,
  scrollable: false,
  labelMaxWidthClass: 'max-w-[140px]',
})

const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const menu = useMenuButton({
  id: props.id,
  triggerRef,
  menuRef: panelRef,
  closeOnOutside: false,
})
const { floatingStyle } = useFloatingMenu({
  open: menu.isOpen,
  triggerRef,
  placement: 'top-start',
  width: props.width,
  estimatedHeight: props.estimatedHeight,
  zIndex: 80,
})

function closeMenu(options: { restoreFocus?: boolean } = { restoreFocus: true }) {
  menu.closeMenu(options)
}

useOutsidePointer({
  root: [triggerRef, panelRef],
  active: menu.isOpen,
  onOutside: () => menu.closeMenu(),
})

defineExpose({ closeMenu })
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-2.5 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-200 hover:border-brand-300 dark:hover:border-brand-700 cursor-pointer transition-colors"
      :title="title"
      :aria-label="menuAriaLabel"
      v-bind="menu.triggerAttrs.value"
      @click="menu.toggleMenu()"
      @keydown="menu.onTriggerKeydown($event)"
    >
      <component :is="icon" class="size-3.5 text-brand-500" />
      <span class="truncate" :class="labelMaxWidthClass">{{ label }}</span>
      <ChevronUp class="size-3 transition-transform" :class="menu.isOpen.value ? '' : 'rotate-180'" />
    </button>

    <Teleport to="body">
      <div
        v-if="menu.isOpen.value"
        :id="id"
        ref="panelRef"
        class="ui-floating-menu factory-dashboard-portal rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1"
        :class="scrollable ? 'max-h-[60vh] overflow-y-auto' : ''"
        :style="floatingStyle"
        role="menu"
        @keydown="menu.onMenuKeydown"
      >
        <slot :close-menu="closeMenu" />
      </div>
    </Teleport>
  </div>
</template>