<script setup lang="ts">
import { Filter, Plus, X } from 'lucide-vue-next'
import {
  PROPERTY_COLOR_CLASSES,
  type PropertyDefinition,
  type PropertyEntityType,
  type PropertyFilter,
  type PropertyOperator,
} from '~~/shared/properties'

/**
 * PropertyFilterBar — chip-style filter UI for list pages.
 *
 * Holds an array of `PropertyFilter` and emits `update:modelValue` whenever
 * a filter is added, removed, or modified. The parent serializes this to
 * the `propertyFilters` query string param to send to the list endpoint.
 */

const props = defineProps<{
  modelValue: PropertyFilter[]
  entityType: PropertyEntityType
  /** Optional jobId to also include per-job application properties in the picker. */
  jobId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PropertyFilter[]): void
}>()

const { definitions } = useProperties({
  entityType: () => props.entityType,
  jobId: () => props.jobId ?? null,
})

const definitionMap = computed(() => {
  const map = new Map<string, PropertyDefinition>()
  for (const d of definitions.value) map.set(d.id, d)
  return map
})

const pickerOpen = ref(false)
const pickerEl = ref<HTMLElement | null>(null)
const pickerTriggerRef = ref<HTMLElement | null>(null)
const pickerMenuEl = ref<HTMLElement | null>(null)
const { floatingStyle: pickerStyle, updateFloatingPosition: updatePickerPosition } = useFloatingMenu({
  open: pickerOpen,
  triggerRef: pickerTriggerRef,
  width: 256,
  estimatedHeight: 288,
  zIndex: 90,
})

function focusFirstPickerOption() {
  nextTick(() => {
    pickerMenuEl.value?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  })
}

function openPicker() {
  pickerOpen.value = true
  nextTick(() => {
    updatePickerPosition()
    focusFirstPickerOption()
  })
}

function closePicker(options: { restoreFocus?: boolean } = {}) {
  pickerOpen.value = false
  if (options.restoreFocus) pickerTriggerRef.value?.focus()
}

function closePickerOnOutside(e: PointerEvent) {
  if (!pickerOpen.value || !pickerEl.value) return
  const target = e.target as Node
  if (pickerEl.value.contains(target) || pickerMenuEl.value?.contains(target)) return
  closePicker()
}
watchEffect((onCleanup) => {
  if (pickerOpen.value && import.meta.client) {
    document.addEventListener('pointerdown', closePickerOnOutside, true)
    onCleanup(() => document.removeEventListener('pointerdown', closePickerOnOutside, true))
  }
})

function defaultOpFor(def: PropertyDefinition): PropertyOperator {
  switch (def.type) {
    case 'select':
    case 'checkbox':
      return 'equals'
    case 'multi_select':
      return 'in'
    case 'text':
    case 'long_text':
    case 'url':
    case 'email':
    case 'person':
      return 'contains'
    default:
      return 'isNotEmpty'
  }
}

function operatorsFor(def: PropertyDefinition): PropertyOperator[] {
  switch (def.type) {
    case 'select':
      return ['equals', 'isEmpty', 'isNotEmpty']
    case 'multi_select':
      return ['in', 'isEmpty', 'isNotEmpty']
    case 'checkbox':
      return ['equals', 'isEmpty', 'isNotEmpty']
    case 'text':
    case 'long_text':
    case 'url':
    case 'email':
    case 'person':
      return ['contains', 'equals', 'isEmpty', 'isNotEmpty']
    case 'number':
    case 'date':
      return ['equals', 'isEmpty', 'isNotEmpty']
    case 'file':
      return ['isEmpty', 'isNotEmpty']
  }
}

const OPERATOR_LABELS: Record<PropertyOperator, string> = {
  equals: 'is',
  contains: 'contains',
  in: 'is any of',
  isEmpty: 'is empty',
  isNotEmpty: 'is set',
}

function addFilter(def: PropertyDefinition) {
  const op = defaultOpFor(def)
  const next: PropertyFilter = {
    propertyDefinitionId: def.id,
    op,
    value: op === 'equals' && def.type === 'checkbox' ? true : op === 'in' ? [] : '',
  }
  emit('update:modelValue', [...props.modelValue, next])
  closePicker({ restoreFocus: true })
}

function removeFilter(idx: number) {
  const next = props.modelValue.filter((_, i) => i !== idx)
  emit('update:modelValue', next)
}

function patchFilter(idx: number, patch: Partial<PropertyFilter>) {
  const next = props.modelValue.map((f, i) => (i === idx ? { ...f, ...patch } : f))
  emit('update:modelValue', next)
}

function clearAll() {
  emit('update:modelValue', [])
}

const editingIdx = ref<number | null>(null)
const editEl = ref<HTMLElement | null>(null)
const editTriggerEl = ref<HTMLElement | null>(null)
const editTriggerRefs = ref<Record<number, HTMLElement | null>>({})
const isEditingFilter = computed(() => editingIdx.value !== null)
const { floatingStyle: editStyle, updateFloatingPosition: updateEditPosition } = useFloatingMenu({
  open: isEditingFilter,
  triggerRef: editTriggerEl,
  width: 320,
  estimatedHeight: 300,
  zIndex: 90,
})

function setEditElRef(el: Element | ComponentPublicInstance | null, filterIdx: number) {
  if (editingIdx.value === filterIdx) editEl.value = el as HTMLElement | null
}

function setEditTriggerRef(el: Element | ComponentPublicInstance | null, filterIdx: number) {
  editTriggerRefs.value[filterIdx] = el as HTMLElement | null
}

function toggleEditFilter(filterIdx: number, event: MouseEvent | KeyboardEvent) {
  if (editingIdx.value === filterIdx) {
    closeEdit({ restoreFocus: true })
    return
  }

  editTriggerEl.value = event.currentTarget as HTMLElement
  editingIdx.value = filterIdx
  nextTick(updateEditPosition)
}

function closeEdit(options: { restoreFocus?: boolean } = {}) {
  const previousIdx = editingIdx.value
  editingIdx.value = null
  editTriggerEl.value = null
  if (options.restoreFocus && previousIdx !== null) editTriggerRefs.value[previousIdx]?.focus()
}

function closeEditOnOutside(e: PointerEvent) {
  if (editingIdx.value === null) return
  const target = e.target as Node
  if (editTriggerEl.value?.contains(target) || editEl.value?.contains(target)) return
  closeEdit()
}
watchEffect((onCleanup) => {
  if (editingIdx.value !== null && import.meta.client) {
    document.addEventListener('pointerdown', closeEditOnOutside, true)
    onCleanup(() => document.removeEventListener('pointerdown', closeEditOnOutside, true))
  }
})

function summarizeFilter(f: PropertyFilter): string {
  const def = definitionMap.value.get(f.propertyDefinitionId)
  if (!def) return ''
  const opLabel = OPERATOR_LABELS[f.op]
  if (f.op === 'isEmpty' || f.op === 'isNotEmpty') return `${def.name} ${opLabel}`
  if (f.op === 'in') {
    const ids = (f.value as string[]) ?? []
    const opts = (def.config as { options?: { id: string; label: string }[] } | null)?.options ?? []
    const labels = ids.map((id) => opts.find((o) => o.id === id)?.label).filter(Boolean)
    return `${def.name} ${opLabel} ${labels.join(', ') || '…'}`
  }
  if (def.type === 'select') {
    const opts = (def.config as { options?: { id: string; label: string }[] } | null)?.options ?? []
    const label = opts.find((o) => o.id === f.value)?.label ?? '…'
    return `${def.name} ${opLabel} ${label}`
  }
  if (def.type === 'checkbox') return `${def.name} ${opLabel} ${f.value ? 'checked' : 'unchecked'}`
  return `${def.name} ${opLabel} ${f.value || '…'}`
}

const showableDefs = computed(() => definitions.value)
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <!-- Existing filter chips -->
    <div
      v-for="(f, idx) in modelValue"
      :key="`${f.propertyDefinitionId}-${idx}`"
      class="relative"
    >
      <div
        class="ui-filter-chip ui-filter-chip-active text-xs"
      >
        <button
          :ref="(el) => setEditTriggerRef(el, idx)"
          type="button"
          class="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 cursor-pointer"
          :aria-label="`Edit filter: ${summarizeFilter(f)}`"
          @click="toggleEditFilter(idx, $event)"
          @keydown.enter.prevent="toggleEditFilter(idx, $event)"
          @keydown.space.prevent="toggleEditFilter(idx, $event)"
        >
          <span class="max-w-[20rem] truncate">{{ summarizeFilter(f) }}</span>
        </button>
        <button
          type="button"
          class="pr-2 pl-1 py-1 cursor-pointer"
          :aria-label="`Remove filter: ${summarizeFilter(f)}`"
          @click.stop="removeFilter(idx)"
        >
          <X class="size-3" />
        </button>
      </div>

      <!-- Edit popover -->
      <Teleport to="body">
        <div
          v-if="editingIdx === idx"
          :ref="(el) => setEditElRef(el, idx)"
          class="ui-floating-menu factory-filter-dropdown-menu factory-dashboard-portal max-w-[calc(100vw-2rem)] p-3"
          :style="editStyle"
          @keydown.escape.prevent="closeEdit({ restoreFocus: true })"
        >
          <template v-if="definitionMap.get(f.propertyDefinitionId) as PropertyDefinition">
            <div class="space-y-2">
              <div class="ui-menu-divider pb-2 text-xs font-semibold text-surface-700 dark:text-surface-200">
                {{ definitionMap.get(f.propertyDefinitionId)!.name }}
              </div>
              <FactorySelect
                :model-value="f.op"
                :options="operatorsFor(definitionMap.get(f.propertyDefinitionId)!).map(op => ({ value: op, label: OPERATOR_LABELS[op] }))"
                @update:model-value="(value) => patchFilter(idx, { op: value as PropertyOperator })"
              />

            <!-- Value input by op + type -->
            <template v-if="!['isEmpty', 'isNotEmpty'].includes(f.op)">
              <!-- select equals -->
              <FactorySelect
                v-if="definitionMap.get(f.propertyDefinitionId)!.type === 'select' && f.op === 'equals'"
                :model-value="(f.value as string) ?? ''"
                :options="[
                  { value: '', label: '—' },
                  ...(((definitionMap.get(f.propertyDefinitionId)!.config as { options?: { id: string; label: string }[] } | null)?.options ?? []).map(opt => ({ value: opt.id, label: opt.label }))),
                ]"
                @update:model-value="(value) => patchFilter(idx, { value: value || null })"
              />

              <!-- multi_select in -->
              <div v-else-if="definitionMap.get(f.propertyDefinitionId)!.type === 'multi_select' && f.op === 'in'" class="flex flex-wrap gap-1">
                <button
                  v-for="opt in ((definitionMap.get(f.propertyDefinitionId)!.config as { options?: { id: string; label: string; color: keyof typeof PROPERTY_COLOR_CLASSES }[] } | null)?.options ?? [])"
                  :key="opt.id"
                  type="button"
                  class="cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium transition-opacity"
                  :class="[PROPERTY_COLOR_CLASSES[opt.color].chip, ((f.value as string[]) ?? []).includes(opt.id) ? '' : 'opacity-50 hover:opacity-100']"
                  @click="() => {
                    const arr = ((f.value as string[]) ?? []).slice()
                    const i = arr.indexOf(opt.id)
                    if (i >= 0) arr.splice(i, 1); else arr.push(opt.id)
                    patchFilter(idx, { value: arr })
                  }"
                >{{ opt.label }}</button>
              </div>

              <!-- checkbox equals -->
              <FactorySelect
                v-else-if="definitionMap.get(f.propertyDefinitionId)!.type === 'checkbox'"
                :model-value="String(f.value ?? false)"
                :options="[
                  { value: 'true', label: 'checked' },
                  { value: 'false', label: 'unchecked' },
                ]"
                @update:model-value="(value) => patchFilter(idx, { value: value === 'true' })"
              />

              <!-- date / number equals -->
              <input
                v-else-if="definitionMap.get(f.propertyDefinitionId)!.type === 'date' && f.op === 'equals'"
                type="date"
                :value="(f.value as string) ?? ''"
                class="ui-field px-2 py-1"
                @change="(e) => patchFilter(idx, { value: (e.target as HTMLInputElement).value || null })"
              />
              <input
                v-else-if="definitionMap.get(f.propertyDefinitionId)!.type === 'number' && f.op === 'equals'"
                type="number"
                step="any"
                :value="(f.value as number) ?? ''"
                class="ui-field px-2 py-1"
                @input="(e) => { const v = (e.target as HTMLInputElement).value; patchFilter(idx, { value: v === '' ? null : Number(v) }) }"
              />

              <!-- default text -->
              <input
                v-else
                type="text"
                :value="(f.value as string) ?? ''"
                placeholder="Value"
                class="ui-field px-2 py-1"
                @input="(e) => patchFilter(idx, { value: (e.target as HTMLInputElement).value })"
              />
            </template>
            </div>
          </template>
        </div>
      </Teleport>
    </div>

    <!-- Add filter -->
    <div class="relative" ref="pickerEl">
      <button
        ref="pickerTriggerRef"
        type="button"
        class="ui-button ui-button-secondary factory-filter-dropdown-trigger px-2.5 py-1 text-xs"
        :aria-expanded="pickerOpen"
        aria-haspopup="menu"
        @click="pickerOpen ? closePicker({ restoreFocus: true }) : openPicker()"
        @keydown.enter.prevent="openPicker()"
        @keydown.space.prevent="openPicker()"
        @keydown.arrow-down.prevent="openPicker()"
        @keydown.escape.prevent="closePicker({ restoreFocus: true })"
      >
        <component :is="modelValue.length === 0 ? Filter : Plus" class="size-3.5" />
        {{ modelValue.length === 0 ? 'Filter' : 'Add filter' }}
      </button>
      <Teleport to="body">
        <div
          v-if="pickerOpen"
          ref="pickerMenuEl"
          class="ui-floating-menu factory-filter-dropdown-menu factory-dashboard-portal max-w-[calc(100vw-2rem)]"
          :style="pickerStyle"
          role="menu"
          @keydown.escape.prevent="closePicker({ restoreFocus: true })"
        >
          <div class="max-h-72 overflow-y-auto py-1">
            <button
              v-for="def in showableDefs"
              :key="def.id"
              type="button"
              class="ui-menu-action factory-filter-dropdown-option justify-between px-3 py-1.5 text-sm"
              role="menuitem"
              @click="addFilter(def)"
            >
              <span class="truncate text-surface-800 dark:text-surface-100">{{ def.name }}</span>
              <span class="text-[10px] uppercase tracking-wide text-surface-400">{{ def.type }}</span>
            </button>
            <div v-if="showableDefs.length === 0" class="px-3 py-2 text-xs text-surface-400">
              No properties to filter by yet.
            </div>
          </div>
        </div>
      </Teleport>
    </div>

    <button
      v-if="modelValue.length > 0"
      type="button"
      class="ui-filter-chip ui-filter-chip-inactive"
      @click="clearAll"
    >Clear all</button>
  </div>
</template>
