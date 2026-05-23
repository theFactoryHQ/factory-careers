<script setup lang="ts">
import { ChevronDown, Check } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: any
  options: Array<{ value: any; label: string }>
  placeholder?: string
  disabled?: boolean
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const opts = props.options ?? []
  const found = opts.find(o => o.value === props.modelValue)
  return found ? found.label : (props.placeholder || 'Select...')
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function select(value: any) {
  emit('update:modelValue', value)
  open.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (typeof document === 'undefined') return
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

watch(open, (val) => {
  if (typeof document === 'undefined') return
  if (val) {
    document.addEventListener('click', handleClickOutside, true)
  } else {
    document.removeEventListener('click', handleClickOutside, true)
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', handleClickOutside, true)
  }
})
</script>

<template>
  <div ref="menuRef" class="factory-filter-dropdown relative" :class="class">
    <button
      type="button"
      class="factory-filter-select factory-filter-dropdown-trigger flex w-full items-center justify-between gap-2 border px-3 py-2 text-sm text-left focus:outline-none transition-colors"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <ChevronDown
        class="size-3.5 shrink-0 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <div
      v-if="open"
      class="factory-filter-dropdown-menu absolute left-0 right-0 top-full z-[70] mt-1 border py-1"
      role="listbox"
    >
      <button
        v-for="opt in (options ?? [])"
        :key="String(opt.value)"
        type="button"
        class="factory-filter-dropdown-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
        :class="{ 'is-active': modelValue === opt.value }"
        role="option"
        :aria-selected="modelValue === opt.value"
        @click="select(opt.value)"
      >
        <Check class="size-3.5 shrink-0" :class="modelValue === opt.value ? '' : 'opacity-0'" />
        <span class="truncate">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>
