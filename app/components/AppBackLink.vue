<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'

defineOptions({
  inheritAttrs: false,
})

defineProps<{
  to?: string
  type?: 'button' | 'submit' | 'reset'
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()

const baseClass = 'factory-back-button inline-flex h-10 min-h-10 items-center gap-2 border border-transparent bg-black px-4 py-0 text-xs font-medium uppercase tracking-normal text-white/62 transition-colors no-underline hover:border-white hover:bg-white hover:text-black'
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    :class="baseClass"
    v-bind="$attrs"
  >
    <ArrowLeft class="size-4 shrink-0" />
    <slot />
  </NuxtLink>
  <button
    v-else
    :type="type ?? 'button'"
    :class="baseClass"
    v-bind="$attrs"
    @click="$emit('click', $event)"
  >
    <ArrowLeft class="size-4 shrink-0" />
    <slot />
  </button>
</template>
