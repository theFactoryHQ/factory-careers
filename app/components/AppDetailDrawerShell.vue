<script setup lang="ts">
import { ExternalLink, X } from 'lucide-vue-next'

defineProps<{
  title: string
  drawerAriaLabel: string
  fullPageHref: string
  closeAriaLabel: string
}>()

const emit = defineEmits<{
  close: []
}>()

const drawerRef = ref<HTMLElement | null>(null)
let previousBodyOverflow = ''

onMounted(() => {
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow
})

useFocusTrap({
  root: drawerRef,
  active: true,
  onEscape: () => emit('close'),
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[55]"
        @click="emit('close')"
      />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      leave-active-class="transition-transform duration-200 ease-in"
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
    >
      <aside
        ref="drawerRef"
        class="factory-dashboard-portal ui-drawer-panel fixed inset-y-0 right-0 z-[60] w-full max-w-2xl flex flex-col border-l border-white/12 bg-black text-white shadow-none"
        role="dialog"
        aria-modal="true"
        :aria-label="drawerAriaLabel"
      >
        <header class="ui-drawer-header flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-5 py-4">
          <h2 class="truncate text-sm font-semibold text-white">{{ title }}</h2>
          <div class="flex shrink-0 items-center gap-2">
            <NuxtLink
              :to="fullPageHref"
              class="factory-toolbar-button inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium uppercase text-white/78 transition-colors hover:text-white"
            >
              <ExternalLink class="size-3.5" />
              Open full page
            </NuxtLink>
            <button
              type="button"
              class="ui-button ui-button-ghost ui-panel-close-button shrink-0 p-1.5"
              :aria-label="closeAriaLabel"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </div>
        </header>

        <div class="ui-drawer-body flex-1 space-y-4 overflow-y-auto bg-black p-5">
          <slot />
        </div>
      </aside>
    </Transition>

    <slot name="overlays" />
  </Teleport>
</template>