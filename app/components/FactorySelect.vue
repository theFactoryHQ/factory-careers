<script setup lang="ts">
import { ChevronDown, Check } from 'lucide-vue-next'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  id?: string
  modelValue: any
  options: ReadonlyArray<{ value: any; label: string }>
  placeholder?: string
  disabled?: boolean
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const opts = props.options ?? []
  const found = opts.find(o => o.value === props.modelValue)
  return found ? found.label : (props.placeholder || 'Select...')
})

const generatedSelectId = useId()
const selectId = computed(() => props.id ?? generatedSelectId)
const selectedIndex = computed(() => (props.options ?? []).findIndex(o => o.value === props.modelValue))

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function select(value: any) {
  emit('update:modelValue', value)
  open.value = false
}

function selectByIndex(index: number) {
  const option = (props.options ?? [])[index]
  if (option) select(option.value)
}

const listboxNavigation = useListboxNavigation({
  idBase: selectId,
  open,
  optionCount: computed(() => props.options?.length ?? 0),
  selectedIndex,
  openListbox: () => {
    if (!props.disabled) open.value = true
  },
  closeListbox: () => {
    open.value = false
    triggerRef.value?.focus()
  },
  selectIndex: selectByIndex,
})
const activeDescendantId = listboxNavigation.activeDescendantId
const activeOptionIndex = listboxNavigation.activeIndex

useOutsidePointer({
  root: menuRef,
  active: open,
  eventName: 'click',
  onOutside: () => {
    open.value = false
  },
})
</script>

<template>
  <div ref="menuRef" class="factory-filter-dropdown relative" :class="class">
    <button
      ref="triggerRef"
      :id="selectId"
      type="button"
      class="factory-filter-select factory-filter-dropdown-trigger flex w-full items-center justify-between gap-2 border px-3 py-2 text-sm text-left focus:outline-none transition-colors"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="`${selectId}-listbox`"
      :aria-activedescendant="activeDescendantId"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="listboxNavigation.onKeydown"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <ChevronDown
        class="size-3.5 shrink-0 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <div
      v-if="open"
      :id="`${selectId}-listbox`"
      class="factory-filter-dropdown-menu absolute left-0 right-0 top-full z-[70] mt-1 border py-1"
      role="listbox"
      @keydown="listboxNavigation.onKeydown"
    >
      <button
        v-for="(opt, idx) in (options ?? [])"
        :key="String(opt.value)"
        :id="listboxNavigation.optionId(idx)"
        type="button"
        class="factory-filter-dropdown-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
        :class="{ 'is-active': modelValue === opt.value || activeOptionIndex === idx }"
        role="option"
        :aria-selected="modelValue === opt.value"
        @mouseenter="listboxNavigation.activate(idx)"
        @click="select(opt.value)"
      >
        <Check class="size-3.5 shrink-0" :class="modelValue === opt.value ? '' : 'opacity-0'" />
        <span class="truncate">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>
