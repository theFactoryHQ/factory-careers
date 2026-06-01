<script setup lang="ts">
import { Columns2, Check } from 'lucide-vue-next'

const props = defineProps<{
  columns: { key: string; label: string; required?: boolean }[]
  modelValue: Record<string, boolean>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, boolean>]
}>()

const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const columnsMenu = useMenuButton({
  id: 'columns-menu',
  triggerRef,
  menuRef: panelRef,
  closeOnOutside: false,
})
const { floatingStyle } = useFloatingMenu({
  open: columnsMenu.isOpen,
  triggerRef,
  placement: 'bottom-end',
  width: 192,
  estimatedHeight: 260,
  zIndex: 80,
})

function toggle(key: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: !props.modelValue[key] })
}

useOutsidePointer({
  root: [triggerRef, panelRef],
  active: columnsMenu.isOpen,
  onOutside: () => columnsMenu.closeMenu(),
})

const hiddenCount = computed(() =>
  props.columns.filter(col => !col.required && !props.modelValue[col.key]).length,
)
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap"
      :class="{ 'is-active': hiddenCount > 0 }"
      aria-label="Columns"
      v-bind="columnsMenu.triggerAttrs.value"
      @click.stop="columnsMenu.toggleMenu()"
      @keydown="columnsMenu.onTriggerKeydown($event)"
    >
      <Columns2 class="size-4" />
      <span>Columns</span>
      <span
        v-if="hiddenCount > 0"
        class="ui-pill ui-pill-brand min-w-[1rem] h-4 justify-center px-1 py-0 text-[10px]"
      >{{ hiddenCount }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="columnsMenu.isOpen.value"
        id="columns-menu"
        ref="panelRef"
        class="ui-floating-menu factory-dashboard-portal rounded-xl border border-white/10 bg-black py-1 shadow-2xl text-white"
        :style="floatingStyle"
        role="menu"
        aria-label="Toggle columns"
        @keydown="columnsMenu.onMenuKeydown"
      >
        <div class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/50 border-b border-white/10 mb-1">
          Toggle columns
        </div>
        <button
          v-for="col in columns"
          :key="col.key"
          type="button"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-white/5 transition-colors"
          :class="col.required
            ? 'text-white/40 cursor-not-allowed'
            : ''"
          :disabled="col.required"
          role="menuitemcheckbox"
          :aria-checked="col.required || modelValue[col.key]"
          @click="!col.required && toggle(col.key)"
        >
          <span
            class="inline-flex size-4 shrink-0 items-center justify-center rounded border border-white/30"
            :class="(col.required || modelValue[col.key])
              ? 'bg-brand-500 border-brand-500'
              : ''"
          >
            <Check v-if="col.required || modelValue[col.key]" class="size-3 text-white" />
          </span>
          {{ col.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
