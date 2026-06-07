<script setup lang="ts">
import { SlidersHorizontal, X, Maximize2, Minimize2 } from 'lucide-vue-next'
import type { SavedView } from '~/composables/useSavedViews'

const props = withDefaults(defineProps<{
  searchInput: string
  searchAriaLabel: string
  searchPlaceholder: string
  views: SavedView<Record<string, unknown>>[]
  activeViewId: string | null
  isDirty?: boolean
  visibleColumns: Record<string, boolean>
  columns: { key: string, label: string, required?: boolean }[]
  filterCount: number
  showClear?: boolean
  isFullscreen: boolean
  clearButtonClass?: string
}>(), {
  isDirty: false,
  showClear: false,
  clearButtonClass: 'inline-flex items-center gap-1 text-xs text-white/60 hover:text-danger-600 transition-colors',
})

const emit = defineEmits<{
  'update:searchInput': [value: string]
  'update:visibleColumns': [value: Record<string, boolean>]
  'open-filters': []
  'clear-filters': []
  'toggle-fullscreen': []
  'select-view': [id: string | null]
  'save-view': [name: string]
  'update-view': [id: string]
  'delete-view': [id: string]
  'set-default-view': [id: string | null]
}>()
</script>

<template>
  <div class="flex items-center gap-2 mb-4">
    <GooeySearchInput
      :model-value="searchInput"
      :aria-label="searchAriaLabel"
      class="min-w-0 flex-1 sm:max-w-sm"
      :placeholder="searchPlaceholder"
      reserve-expanded-space
      @update:model-value="emit('update:searchInput', $event)"
    />
    <SavedViewsMenu
      :views="views"
      :active-view-id="activeViewId"
      :is-dirty="isDirty"
      @select="emit('select-view', $event)"
      @save="emit('save-view', $event)"
      @update="emit('update-view', $event)"
      @delete="emit('delete-view', $event)"
      @set-default="emit('set-default-view', $event)"
    />
    <ColumnsMenu
      :model-value="visibleColumns"
      :columns="columns"
      @update:model-value="emit('update:visibleColumns', $event)"
    />
    <button
      type="button"
      class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
      :class="{ 'is-active': filterCount > 0 }"
      @click="emit('open-filters')"
    >
      <SlidersHorizontal class="size-4" />
      <span>Filters</span>
      <span
        v-if="filterCount > 0"
        class="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-semibold"
      >{{ filterCount }}</span>
    </button>
    <button
      v-if="showClear"
      type="button"
      :class="clearButtonClass"
      @click="emit('clear-filters')"
    >
      <X class="size-3" />
      Clear
    </button>
    <button
      type="button"
      class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors"
      :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen table'"
      @click="emit('toggle-fullscreen')"
    >
      <Maximize2 v-if="!isFullscreen" class="size-4" />
      <Minimize2 v-else class="size-4" />
    </button>
  </div>
</template>