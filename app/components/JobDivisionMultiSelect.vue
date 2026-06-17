<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next'
import {
  FACTORY_DIVISIONS,
  formatDivisionLabel,
  type FactoryDivision,
} from '~~/shared/job-listing-structure'

const props = withDefaults(defineProps<{
  id?: string
  modelValue?: FactoryDivision[]
  options?: ReadonlyArray<{ value: FactoryDivision; label: string }>
  placeholder?: string
  tone?: 'dashboard' | 'public'
  class?: string
}>(), {
  options: () => FACTORY_DIVISIONS,
  placeholder: 'Select divisions',
  tone: 'dashboard',
})

const emit = defineEmits<{
  'update:modelValue': [value: FactoryDivision[]]
}>()

const generatedId = useId()
const selectId = computed(() => props.id ?? generatedId)
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const selectedValues = computed(() => props.modelValue ?? [])
const selectedValueSet = computed(() => new Set(selectedValues.value))
const optionByValue = computed(() => new Map(props.options.map((option) => [option.value, option])))
const selectedDivisionOptions = computed(() => selectedValues.value.map((value) =>
  optionByValue.value.get(value) ?? { value, label: formatDivisionLabel(value) }
))

const { floatingStyle } = useFloatingMenu({
  open,
  triggerRef,
  width: 'trigger',
  estimatedHeight: 320,
  zIndex: props.tone === 'public' ? 70 : 80,
})

function toggleOpen() {
  open.value = !open.value
}

function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) nextTick(() => triggerRef.value?.focus())
}

function toggleDivision(value: FactoryDivision) {
  const next = new Set(selectedValues.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  emit('update:modelValue', [...next])
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  }
}

useOutsidePointer({
  root: [rootRef, panelRef],
  active: open,
  eventName: 'click',
  onOutside: () => close(),
})
</script>

<template>
  <div ref="rootRef" class="factory-filter-dropdown relative" :class="class">
    <button
      ref="triggerRef"
      :id="selectId"
      type="button"
      class="flex min-h-10 w-full items-center justify-between gap-2 border px-3 py-2 text-left text-sm outline-none transition-colors"
      :class="tone === 'public'
        ? 'border-white/14 bg-black/35 text-white hover:border-brand-500/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25'
        : 'factory-filter-select factory-filter-dropdown-trigger text-surface-900 dark:text-surface-100 focus:outline-none'"
      :aria-expanded="open"
      :aria-controls="`${selectId}-menu`"
      aria-haspopup="menu"
      @click="toggleOpen"
      @keydown="handleKeydown"
    >
      <span class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <template v-if="selectedDivisionOptions.length > 0">
          <span
            v-for="option in selectedDivisionOptions"
            :key="option.value"
            data-testid="selected-division-badge"
            class="inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium leading-5"
            :class="tone === 'public'
              ? 'border-white/16 bg-white/10 text-white'
              : 'border-brand-500/25 bg-brand-500/10 text-brand-700 dark:border-brand-400/25 dark:bg-brand-400/10 dark:text-brand-100'"
          >
            {{ option.label }}
          </span>
        </template>
        <span
          v-else
          class="truncate"
          :class="tone === 'public' ? 'text-white/55' : 'text-surface-500 dark:text-surface-400'"
        >
          {{ placeholder }}
        </span>
      </span>
      <ChevronDown
        class="size-4 shrink-0 text-brand-500 transition-transform duration-150"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="`${selectId}-menu`"
        ref="panelRef"
        class="max-h-80 overflow-y-auto"
        :class="tone === 'public'
          ? 'factory-public-form-portal border border-white/14 bg-black py-1 text-sm shadow-2xl shadow-black/50'
          : 'factory-filter-dropdown-menu factory-dashboard-portal border py-1'"
        :style="floatingStyle"
        role="menu"
        @keydown="handleKeydown"
      >
        <label
          v-for="option in options"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors"
          :class="tone === 'public'
            ? 'text-white/70 hover:bg-brand-500/12 hover:text-white'
            : 'factory-filter-dropdown-option text-surface-700 dark:text-surface-200'"
        >
          <input
            type="checkbox"
            class="size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 dark:border-surface-600"
            :checked="selectedValueSet.has(option.value)"
            @change="toggleDivision(option.value)"
          />
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <Check
            class="size-3.5 shrink-0 text-brand-500"
            :class="selectedValueSet.has(option.value) ? 'opacity-100' : 'opacity-0'"
          />
        </label>
      </div>
    </Teleport>
  </div>
</template>
