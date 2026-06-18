<script setup lang="ts">
import { ChevronDown, Info } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  id: string
  title: string
  description?: string
  defaultOpen?: boolean
  contentClass?: string
}>(), {
  defaultOpen: false,
  contentClass: 'px-5 pb-5',
})

const headingId = computed(() => `${props.id}-heading`)
const contentId = computed(() => `${props.id}-content`)
const isOpen = ref(props.defaultOpen)
const panelRef = ref<HTMLElement | null>(null)
const panelHeight = ref(props.defaultOpen ? 'auto' : '0px')
const panelOpacity = ref(props.defaultOpen ? '1' : '0')
const isTransitioning = ref(false)
let transitionFallback: number | null = null

watch(() => props.defaultOpen, (defaultOpen) => {
  clearTransitionFallback()
  isOpen.value = defaultOpen
  panelHeight.value = defaultOpen ? 'auto' : '0px'
  panelOpacity.value = defaultOpen ? '1' : '0'
})

onBeforeUnmount(clearTransitionFallback)

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clearTransitionFallback() {
  if (!transitionFallback) return
  window.clearTimeout(transitionFallback)
  transitionFallback = null
}

function completePanelTransition() {
  if (!isTransitioning.value) return
  clearTransitionFallback()
  if (isOpen.value) panelHeight.value = 'auto'
  isTransitioning.value = false
}

async function toggleSection() {
  const panel = panelRef.value
  const nextOpen = !isOpen.value

  if (!panel || prefersReducedMotion()) {
    isOpen.value = nextOpen
    panelHeight.value = nextOpen ? 'auto' : '0px'
    panelOpacity.value = nextOpen ? '1' : '0'
    isTransitioning.value = false
    return
  }

  clearTransitionFallback()
  isTransitioning.value = true

  if (nextOpen) {
    isOpen.value = true
    isTransitioning.value = false
    panelHeight.value = '0px'
    panelOpacity.value = '0'
    await nextTick()
    void panel.offsetHeight
    isTransitioning.value = true
    requestAnimationFrame(() => {
      panelHeight.value = `${panel.scrollHeight}px`
      panelOpacity.value = '1'
    })
  } else {
    isTransitioning.value = false
    panelHeight.value = `${panel.scrollHeight}px`
    panelOpacity.value = '1'
    await nextTick()
    void panel.offsetHeight
    isOpen.value = false
    isTransitioning.value = true
    requestAnimationFrame(() => {
      panelHeight.value = '0px'
      panelOpacity.value = '0'
    })
  }

  transitionFallback = window.setTimeout(completePanelTransition, 260)
}

function finishPanelTransition(event: TransitionEvent) {
  if (event.target !== panelRef.value || event.propertyName !== 'height') return
  completePanelTransition()
}
</script>

<template>
  <section
    :id="id"
    class="ui-panel relative overflow-hidden"
  >
    <div
      class="flex items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-50 dark:hover:bg-surface-900"
      :class="$slots.actions ? 'pr-40' : 'pr-5'"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25"
        :aria-expanded="isOpen"
        :aria-controls="contentId"
        @click="toggleSection"
      >
        <ChevronDown
          class="mt-0.5 size-4 shrink-0 text-surface-400 transition-transform duration-150"
          :class="isOpen ? 'rotate-0' : '-rotate-90'"
        />
        <span class="flex min-w-0 items-center gap-2 rounded-sm focus:outline-none">
          <slot name="icon" />
          <span
            :id="headingId"
            class="truncate text-sm font-semibold text-surface-700 dark:text-surface-300"
          >
            {{ title }}
          </span>
        </span>
      </button>
      <button
        v-if="description"
        class="group/info relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-surface-400 outline-none transition-colors hover:bg-surface-100 hover:text-surface-700 focus-visible:bg-surface-100 focus-visible:text-surface-700 focus-visible:ring-2 focus-visible:ring-brand-500/25 dark:hover:bg-surface-800 dark:hover:text-surface-200 dark:focus-visible:bg-surface-800 dark:focus-visible:text-surface-200"
        type="button"
        :title="description"
        :aria-label="description"
        @click.stop
      >
        <Info class="size-3.5" />
        <span
          class="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 border border-surface-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-surface-600 shadow-lg group-hover/info:block group-focus/info:block dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300"
          aria-hidden="true"
        >
          {{ description }}
        </span>
      </button>
    </div>

    <div
      v-if="$slots.actions"
      class="absolute right-5 top-4 flex items-center gap-2"
    >
      <slot name="actions" />
    </div>

    <div
      ref="panelRef"
      class="overflow-hidden"
      :class="isTransitioning ? 'transition-[height,opacity] duration-150 ease-out motion-reduce:transition-none' : ''"
      :style="{ height: panelHeight, opacity: panelOpacity }"
      @transitionend="finishPanelTransition"
    >
      <div
        :id="contentId"
        :class="contentClass"
        role="region"
        :aria-labelledby="headingId"
        :aria-hidden="!isOpen"
        :inert="!isOpen"
      >
        <slot />
      </div>
    </div>
  </section>
</template>
