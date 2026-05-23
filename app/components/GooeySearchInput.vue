<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { computed, ref, useId, watch } from 'vue'

type GooeySearchSize = 'sm' | 'md' | 'lg'
type GooeySearchTone = 'surface' | 'inverse'
type GooeySearchExpandFrom = 'left' | 'right'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  size?: GooeySearchSize
  tone?: GooeySearchTone
  expandedWidth?: number
  collapsedWidth?: number
  expandFrom?: GooeySearchExpandFrom
  reserveExpandedSpace?: boolean
  showClear?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Type to search...',
  ariaLabel: 'Search',
  disabled: false,
  size: 'md',
  tone: 'surface',
  expandedWidth: 260,
  collapsedWidth: 112,
  expandFrom: 'left',
  reserveExpandedSpace: false,
  showClear: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  openChange: [open: boolean]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(Boolean(props.modelValue))
const rawId = useId()
const filterId = `gooey-search-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

const currentValue = computed(() => props.modelValue ?? '')
const visualOpen = computed(() => isOpen.value || currentValue.value.length > 0)

const sizeConfig = computed(() => {
  if (props.size === 'sm') {
    return {
      height: 34,
      iconWidth: 36,
      iconSize: 'size-3.5',
      clearWidth: 34,
      textClass: 'text-xs',
    }
  }

  if (props.size === 'lg') {
    return {
      height: 48,
      iconWidth: 48,
      iconSize: 'size-5',
      clearWidth: 44,
      textClass: 'text-sm',
    }
  }

  return {
    height: 40,
    iconWidth: 42,
    iconSize: 'size-4',
    clearWidth: 38,
    textClass: 'text-sm',
  }
})

const requestedOuterWidth = computed(() => {
  if (props.reserveExpandedSpace) return '100%'
  return visualOpen.value ? props.expandedWidth : props.collapsedWidth
})
const visualWidth = computed(() => {
  if (props.reserveExpandedSpace) return '100%'
  const requestedWidth = visualOpen.value ? props.expandedWidth : props.collapsedWidth
  return requestedWidth
})
const visualOffset = computed(() => {
  if (props.reserveExpandedSpace) return 0
  if (props.expandFrom === 'right') return Math.max(0, props.expandedWidth - Number(visualWidth.value))
  return 0
})
const inputPaddingLeft = computed(() => sizeConfig.value.iconWidth)
const inputPaddingRight = computed(() => currentValue.value && props.showClear ? sizeConfig.value.clearWidth : 14)

const rootStyle = computed(() => ({
  '--gooey-height': `${sizeConfig.value.height}px`,
  '--gooey-outer-width': typeof requestedOuterWidth.value === 'number' ? `${requestedOuterWidth.value}px` : requestedOuterWidth.value,
  '--gooey-visual-width': typeof visualWidth.value === 'number' ? `${visualWidth.value}px` : visualWidth.value,
  '--gooey-visual-x': `${visualOffset.value}px`,
  '--gooey-icon-width': `${sizeConfig.value.iconWidth}px`,
  '--gooey-clear-width': `${sizeConfig.value.clearWidth}px`,
  '--gooey-input-padding-left': `${inputPaddingLeft.value}px`,
  '--gooey-input-padding-right': `${inputPaddingRight.value}px`,
}))

watch(() => props.modelValue, (value) => {
  if (value) {
    setOpen(true)
  }
})

function setOpen(open: boolean) {
  if (isOpen.value === open) return
  isOpen.value = open
  emit('openChange', open)
}

function updateValue(value: string) {
  emit('update:modelValue', value)
}

function clearValue() {
  updateValue('')
  setOpen(true)
  inputRef.value?.focus()
}

function handleBlur() {
  if (!currentValue.value) {
    setOpen(false)
  }
}

function handleFocus() {
  setOpen(true)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (currentValue.value) {
      updateValue('')
      return
    }

    setOpen(false)
    inputRef.value?.blur()
  }
}
</script>

<template>
  <div
    class="gooey-search"
    :class="[
      `gooey-search-${tone}`,
      { 'gooey-search-disabled': disabled },
    ]"
    :style="rootStyle"
    data-slot="gooey-search-input"
  >
    <svg aria-hidden="true" class="gooey-search-filter">
      <filter :id="filterId">
        <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="5" />
        <feColorMatrix
          in="blur"
          mode="matrix"
          result="goo"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
        />
        <feBlend in="SourceGraphic" in2="goo" />
      </filter>
    </svg>

    <div class="gooey-search-bubbles" :style="{ filter: `url(#${filterId})` }" aria-hidden="true">
      <span class="gooey-search-bubble gooey-search-bubble-surface" />
      <span class="gooey-search-bubble gooey-search-bubble-icon" />
    </div>

    <span class="gooey-search-outline" aria-hidden="true" />

    <div class="gooey-search-control">
      <input
        ref="inputRef"
        :value="currentValue"
        :aria-label="ariaLabel"
        :disabled="disabled"
        :placeholder="placeholder"
        :class="['gooey-search-field', sizeConfig.textClass]"
        type="search"
        @blur="handleBlur"
        @focus="handleFocus"
        @input="updateValue(($event.target as HTMLInputElement).value)"
        @keydown="handleKeydown"
      />

      <button
        type="button"
        class="gooey-search-trigger"
        :disabled="disabled"
        aria-label="Open search"
        @mousedown.prevent
        @click="() => { setOpen(true); inputRef?.focus() }"
      >
        <Search aria-hidden="true" :class="sizeConfig.iconSize" />
      </button>

      <button
        v-if="showClear && currentValue"
        type="button"
        class="gooey-search-clear"
        :disabled="disabled"
        aria-label="Clear search"
        @mousedown.prevent
        @click="clearValue"
      >
        <X aria-hidden="true" class="size-4" />
      </button>

      <div v-if="$slots.trailing" class="gooey-search-trailing">
        <slot name="trailing" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gooey-search {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  width: var(--gooey-outer-width);
  min-width: 0;
  max-width: 100%;
  height: var(--gooey-height);
  align-items: center;
  flex-shrink: 1;
  transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.gooey-search-filter {
  position: absolute;
  width: 0;
  height: 0;
}

.gooey-search-bubbles {
  position: absolute;
  inset: 0;
}

.gooey-search-bubble,
.gooey-search-outline {
  position: absolute;
  top: 0;
  left: 0;
  height: var(--gooey-height);
  width: var(--gooey-visual-width);
  transform: translateX(var(--gooey-visual-x));
  border-radius: 0;
  transition:
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.gooey-search-bubble-icon {
  width: min(var(--gooey-icon-width), var(--gooey-visual-width));
}

.gooey-search-outline {
  z-index: 1;
  pointer-events: none;
  border: 1px solid;
  background: transparent;
}

.gooey-search-control {
  position: relative;
  z-index: 2;
  width: var(--gooey-outer-width);
  max-width: 100%;
  height: var(--gooey-height);
  transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.gooey-search-field {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--gooey-visual-width);
  height: var(--gooey-height);
  transform: translateX(var(--gooey-visual-x));
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  outline: none;
  padding-left: var(--gooey-input-padding-left);
  padding-right: var(--gooey-input-padding-right);
  transition:
    width 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    color 150ms ease;
}

.gooey-search-field::-webkit-search-cancel-button,
.gooey-search-field::-webkit-search-decoration {
  appearance: none;
}

.gooey-search-field:focus-visible {
  box-shadow: none;
}

.gooey-search-trigger,
.gooey-search-clear {
  position: absolute;
  top: 0;
  display: flex;
  height: var(--gooey-height);
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  outline: none;
  transition:
    color 150ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.gooey-search-trigger {
  left: 0;
  width: var(--gooey-icon-width);
  transform: translateX(var(--gooey-visual-x));
}

.gooey-search-clear {
  right: calc(var(--gooey-outer-width) - var(--gooey-visual-width) - var(--gooey-visual-x));
  width: var(--gooey-clear-width);
}

.gooey-search-trigger:hover,
.gooey-search-clear:hover,
.gooey-search-trigger:focus-visible,
.gooey-search-clear:focus-visible {
  color: var(--color-brand-500);
}

.gooey-search-trailing {
  position: absolute;
  top: 50%;
  right: 12px;
  z-index: 3;
  display: flex;
  transform: translateY(-50%);
  pointer-events: none;
}

.gooey-search-surface {
  color: var(--color-surface-900);
}

.dark .gooey-search-surface {
  color: var(--color-surface-100);
}

.gooey-search-surface .gooey-search-bubble,
.gooey-search-surface .gooey-search-outline {
  background: transparent;
  border-color: var(--color-surface-300);
  box-shadow: none;
}

.dark .gooey-search-surface .gooey-search-bubble,
.dark .gooey-search-surface .gooey-search-outline {
  background: transparent;
  border-color: var(--color-surface-700);
  box-shadow: none;
}

.gooey-search-surface .gooey-search-field::placeholder,
.gooey-search-surface .gooey-search-trigger,
.gooey-search-surface .gooey-search-clear {
  color: var(--color-surface-400);
}

.dark .gooey-search-surface .gooey-search-field::placeholder,
.dark .gooey-search-surface .gooey-search-trigger,
.dark .gooey-search-surface .gooey-search-clear {
  color: var(--color-surface-500);
}

.gooey-search-inverse {
  color: #ffffff;
}

.gooey-search-inverse .gooey-search-bubble,
.gooey-search-inverse .gooey-search-outline {
  background: rgb(0 0 0 / 0.35);
  border-color: rgb(255 255 255 / 0.14);
  box-shadow: none;
}

.gooey-search-surface:focus-within .gooey-search-outline,
.gooey-search-inverse:focus-within .gooey-search-outline {
  border-color: var(--color-brand-500);
}

:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-bubble),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-bubble) {
  background: transparent !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-bubbles),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-bubbles) {
  filter: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-outline),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-outline) {
  background: #050505 !important;
  border-color: var(--ui-border-strong) !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface:focus-within),
:global(.factory-dashboard-portal .gooey-search-surface:focus-within) {
  outline: none !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-field),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-field) {
  border: 0 !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface :is(.gooey-search-field, .gooey-search-trigger, .gooey-search-clear):focus),
:global(.factory-dashboard-portal .gooey-search-surface :is(.gooey-search-field, .gooey-search-trigger, .gooey-search-clear):focus) {
  outline: none !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface :is(.gooey-search-field, .gooey-search-trigger, .gooey-search-clear):focus-visible),
:global(.factory-dashboard-portal .gooey-search-surface :is(.gooey-search-field, .gooey-search-trigger, .gooey-search-clear):focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-field:focus),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-field:focus) {
  border: 0 !important;
  background-color: transparent !important;
  outline: none !important;
  box-shadow: none !important;
}

:global(.factory-dashboard-shell .gooey-search-surface:hover .gooey-search-outline),
:global(.factory-dashboard-portal .gooey-search-surface:hover .gooey-search-outline) {
  border-color: var(--ui-border-strong) !important;
}

:global(.factory-dashboard-shell .gooey-search-surface:focus-within .gooey-search-outline),
:global(.factory-dashboard-portal .gooey-search-surface:focus-within .gooey-search-outline) {
  border-color: var(--color-brand-500) !important;
}

:global(.factory-dashboard-shell .gooey-search-surface),
:global(.factory-dashboard-portal .gooey-search-surface),
:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-field::placeholder),
:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-trigger),
:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-clear),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-field::placeholder),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-trigger),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-clear) {
  color: rgb(255 255 255 / 0.72) !important;
}

:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-trigger:hover),
:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-clear:hover),
:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-trigger:focus-visible),
:global(.factory-dashboard-shell .gooey-search-surface .gooey-search-clear:focus-visible),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-trigger:hover),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-clear:hover),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-trigger:focus-visible),
:global(.factory-dashboard-portal .gooey-search-surface .gooey-search-clear:focus-visible) {
  color: #ffffff !important;
}

.gooey-search-inverse .gooey-search-field::placeholder,
.gooey-search-inverse .gooey-search-trigger,
.gooey-search-inverse .gooey-search-clear {
  color: rgb(255 255 255 / 0.45);
}

.gooey-search-disabled {
  pointer-events: none;
  opacity: 0.6;
}
</style>
