<script setup lang="ts">
import type { Component } from 'vue'

type StatAccent = 'brand' | 'violet' | 'teal' | 'blue' | 'green' | 'success' | 'amber' | 'emerald' | 'warning' | 'surface'

const props = withDefaults(defineProps<{
  as?: string
  to?: string | Record<string, unknown>
  icon?: Component
  accent?: StatAccent
  label: string
  paddingClass?: string
  cardClass?: string
  valueClass?: string
  dotClass?: string
  iconClass?: string
  accentLineClass?: string
  labelClass?: string
  captionClass?: string
  extraMetric?: string | number
}>(), {
  as: 'div',
  accent: 'brand',
  paddingClass: 'p-5 sm:p-6',
  cardClass: '',
  valueClass: '',
  dotClass: '',
  iconClass: '',
  accentLineClass: '',
  labelClass: '',
  captionClass: '',
  extraMetric: '',
})

const accentClasses: Record<StatAccent, { card: string, line: string, icon: string, value: string, dot: string }> = {
  brand: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-brand-500/25 dark:hover:ring-brand-400/25 hover:shadow-lg hover:shadow-brand-500/[0.08]',
    line: 'via-brand-500 opacity-0 group-hover:opacity-100',
    icon: 'text-brand-500/[0.03] dark:text-brand-400/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-brand-600 dark:group-hover:text-brand-400',
    dot: 'bg-brand-500',
  },
  violet: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-violet-500/25 dark:hover:ring-violet-400/25 hover:shadow-lg hover:shadow-violet-500/[0.08]',
    line: 'via-violet-500 opacity-0 group-hover:opacity-100',
    icon: 'text-violet-500/[0.03] dark:text-violet-400/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-violet-600 dark:group-hover:text-violet-400',
    dot: 'bg-violet-500',
  },
  teal: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-teal-500/25 dark:hover:ring-teal-400/25 hover:shadow-lg hover:shadow-teal-500/[0.08]',
    line: 'via-teal-500 opacity-0 group-hover:opacity-100',
    icon: 'text-teal-500/[0.03] dark:text-teal-400/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-teal-600 dark:group-hover:text-teal-400',
    dot: 'bg-teal-500',
  },
  blue: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-blue-500/25 dark:hover:ring-blue-400/25 hover:shadow-lg hover:shadow-blue-500/[0.08]',
    line: 'via-blue-500 opacity-0 group-hover:opacity-100',
    icon: 'text-blue-500/[0.03] dark:text-blue-400/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-blue-600 dark:group-hover:text-blue-400',
    dot: 'bg-blue-500',
  },
  green: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-green-500/25 dark:hover:ring-green-400/25 hover:shadow-lg hover:shadow-green-500/[0.08]',
    line: 'via-green-500 opacity-0 group-hover:opacity-100',
    icon: 'text-green-500/[0.03] dark:text-green-400/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-green-600 dark:group-hover:text-green-400',
    dot: 'bg-green-500',
  },
  success: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-success-500/25 dark:hover:ring-success-400/25 hover:shadow-lg hover:shadow-success-500/[0.08]',
    line: 'via-success-500 opacity-0 group-hover:opacity-100',
    icon: 'text-success-500/[0.03] dark:text-success-400/[0.05]',
    value: 'text-success-600 dark:text-success-400',
    dot: 'bg-success-500',
  },
  amber: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-amber-500/25 dark:hover:ring-amber-400/25 hover:shadow-lg hover:shadow-amber-500/[0.08]',
    line: 'via-amber-500 opacity-0 group-hover:opacity-100',
    icon: 'text-amber-500/[0.03] dark:text-amber-400/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-amber-600 dark:group-hover:text-amber-400',
    dot: 'bg-amber-500',
  },
  emerald: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-emerald-500/25 dark:hover:ring-emerald-400/25 hover:shadow-lg hover:shadow-emerald-500/[0.08]',
    line: 'via-emerald-500 opacity-0 group-hover:opacity-100',
    icon: 'text-emerald-500/[0.03] dark:text-emerald-400/[0.05]',
    value: 'text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  warning: {
    card: 'ring-1 ring-warning-400/30 dark:ring-warning-500/20 hover:ring-warning-500/40 dark:hover:ring-warning-400/30 shadow-sm shadow-warning-500/[0.06] hover:shadow-lg hover:shadow-warning-500/[0.12]',
    line: 'via-warning-500 opacity-60 group-hover:opacity-100',
    icon: 'text-warning-500/[0.04] dark:text-warning-400/[0.06]',
    value: 'text-warning-600 dark:text-warning-400 group-hover:text-warning-700 dark:group-hover:text-warning-300',
    dot: 'bg-warning-500',
  },
  surface: {
    card: 'ring-1 ring-surface-950/[0.04] dark:ring-white/[0.06] hover:ring-surface-300/50 dark:hover:ring-surface-600/30 hover:shadow-lg hover:shadow-surface-500/[0.04]',
    line: 'via-surface-400 opacity-0 group-hover:opacity-40',
    icon: 'text-surface-400/[0.03] dark:text-surface-500/[0.05]',
    value: 'text-surface-900 dark:text-surface-50 group-hover:text-surface-600 dark:group-hover:text-surface-300',
    dot: 'bg-surface-300 dark:bg-surface-600',
  },
}

const resolvedAccent = computed(() => accentClasses[props.accent])
const componentTag = computed(() => props.to ? resolveComponent('NuxtLink') : props.as)
const componentAttrs = computed(() => props.to ? { to: props.to } : {})
const resolvedLineClass = computed(() => props.accentLineClass || resolvedAccent.value.line)
const resolvedIconClass = computed(() => props.iconClass || resolvedAccent.value.icon)
const resolvedValueClass = computed(() => props.valueClass || resolvedAccent.value.value)
const resolvedDotClass = computed(() => props.dotClass || resolvedAccent.value.dot)
const resolvedLabelClass = computed(() => props.labelClass || 'mt-3')
const resolvedCaptionClass = computed(() => props.captionClass || 'text-surface-300 dark:text-surface-600')
</script>

<template>
  <component
    :is="componentTag"
    v-bind="componentAttrs"
    :class="[
      'group ui-dashboard-stat-card no-underline',
      paddingClass,
      resolvedAccent.card,
      cardClass,
    ]"
  >
    <div
      class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-500"
      :class="resolvedLineClass"
    />
    <component
      :is="icon"
      v-if="icon"
      class="absolute -bottom-3 -right-3 size-24 rotate-12 transition-transform duration-700 ease-out group-hover:rotate-3 group-hover:scale-110 pointer-events-none"
      :class="resolvedIconClass"
    />
    <div class="relative">
      <div class="flex items-baseline gap-2">
        <span
          class="text-3xl sm:text-4xl font-black tracking-tight tabular-nums leading-none transition-colors duration-300"
          :class="resolvedValueClass"
        >
          <slot name="value">{{ extraMetric }}</slot>
        </span>
        <span class="relative shrink-0 mb-1">
          <span class="factory-dashboard-stat-dot" :class="resolvedDotClass" />
          <slot name="dot" />
        </span>
      </div>
      <span
        class="block text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-400 dark:text-surface-500"
        :class="resolvedLabelClass"
      >
        {{ label }}
      </span>
      <p class="text-[11px] mt-1" :class="resolvedCaptionClass">
        <slot name="caption" />
      </p>
      <slot name="extra" />
    </div>
  </component>
</template>
