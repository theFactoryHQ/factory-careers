<script setup lang="ts">
import { Columns2, Check } from 'lucide-vue-next'

const props = defineProps<{
  columns: { key: string; label: string; required?: boolean }[]
  modelValue: Record<string, boolean>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, boolean>]
}>()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function toggle(key: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: !props.modelValue[key] })
}

function handleClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

watch(open, (val) => {
  if (val) document.addEventListener('click', handleClickOutside)
  else document.removeEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const hiddenCount = computed(() =>
  props.columns.filter(col => !col.required && !props.modelValue[col.key]).length,
)
</script>

<template>
  <div ref="menuRef" class="relative">
    <button
      type="button"
      class="ui-menu-trigger px-3 py-2 text-sm"
      :class="hiddenCount > 0
        ? 'ui-menu-trigger-active'
        : ''"
      @click.stop="open = !open"
    >
      <Columns2 class="size-4" />
      Columns
      <span
        v-if="hiddenCount > 0"
        class="ui-pill ui-pill-brand min-w-[1rem] h-4 justify-center px-1 py-0 text-[10px]"
      >{{ hiddenCount }}</span>
    </button>

    <div
      v-if="open"
      class="ui-floating-menu absolute right-0 z-50 mt-1 w-48 py-1"
    >
      <div class="ui-menu-divider px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500 mb-1">
        Toggle columns
      </div>
      <button
        v-for="col in columns"
        :key="col.key"
        type="button"
        class="ui-menu-action px-3 py-1.5 text-sm"
        :class="col.required
          ? 'text-surface-400 dark:text-surface-500 cursor-not-allowed'
          : ''"
        :disabled="col.required"
        @click="!col.required && toggle(col.key)"
      >
        <span
          class="ui-checkbox-indicator size-4 shrink-0"
          :class="(col.required || modelValue[col.key])
            ? 'ui-checkbox-indicator-checked'
            : ''"
        >
          <Check v-if="col.required || modelValue[col.key]" class="size-3" />
        </span>
        {{ col.label }}
      </button>
    </div>
  </div>
</template>
