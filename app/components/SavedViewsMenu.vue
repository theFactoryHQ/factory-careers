<script setup lang="ts" generic="T extends Record<string, unknown>">
import { Bookmark, Star, Trash2, Plus, Check, ChevronDown } from 'lucide-vue-next'
import type { SavedView } from '~/composables/useSavedViews'

const props = defineProps<{
  views: SavedView<T>[]
  activeViewId: string | null
  /** Whether current settings differ from the active view (i.e. unsaved edits). */
  isDirty?: boolean
}>()

const emit = defineEmits<{
  'select': [id: string | null]
  'save': [name: string]
  'update': [id: string]
  'delete': [id: string]
  'set-default': [id: string | null]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const { floatingStyle } = useFloatingMenu({
  open,
  triggerRef,
  width: 288,
  estimatedHeight: 360,
  zIndex: 90,
})

const showSaveForm = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const activeView = computed(() => props.views.find(v => v.id === props.activeViewId) ?? null)

const buttonLabel = computed(() => {
  if (activeView.value) return activeView.value.name
  return 'Views'
})

function toggle() {
  open.value = !open.value
  if (!open.value) showSaveForm.value = false
}

function close() {
  open.value = false
  showSaveForm.value = false
  newName.value = ''
}

function handleOutside(e: MouseEvent) {
  const target = e.target as Node
  if (rootRef.value?.contains(target) || panelRef.value?.contains(target)) return
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutside)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutside)
  document.removeEventListener('keydown', onKeydown)
})

function selectView(id: string | null) {
  emit('select', id)
  close()
}

async function openSaveForm() {
  showSaveForm.value = true
  newName.value = activeView.value?.name ? `${activeView.value.name} (copy)` : `View ${props.views.length + 1}`
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function submitSave() {
  const name = newName.value.trim()
  if (!name) return
  emit('save', name)
  close()
}

function onUpdate(id: string, e: Event) {
  e.stopPropagation()
  emit('update', id)
  close()
}

function onSetDefault(id: string, isDefault: boolean | undefined, e: Event) {
  e.stopPropagation()
  emit('set-default', isDefault ? null : id)
}

function onDelete(id: string, e: Event) {
  e.stopPropagation()
  emit('delete', id)
}
</script>

<template>
  <div ref="rootRef" class="factory-saved-views-menu relative inline-block">
    <button
      ref="triggerRef"
      type="button"
      class="factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
      :class="{ 'is-active': activeViewId }"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <Bookmark class="size-4" :class="activeView?.isDefault ? 'fill-current text-amber-500' : ''" />
      <span class="max-w-[160px] truncate">{{ buttonLabel }}</span>
      <span
        v-if="isDirty && activeViewId"
        class="size-1.5 rounded-full bg-amber-500"
        title="Unsaved changes"
      />
      <ChevronDown class="size-3.5 opacity-60" />
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="factory-saved-views-panel factory-dashboard-portal rounded-xl border overflow-hidden"
      :style="floatingStyle"
      role="menu"
    >
      <!-- "All / no view" -->
      <button
        type="button"
        class="factory-saved-views-option w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
        :class="{ 'is-active': !activeViewId }"
        @click="selectView(null)"
      >
        <Check class="size-3.5" :class="!activeViewId ? '' : 'opacity-0'" />
        <span class="flex-1">All (no view)</span>
      </button>

      <!-- Saved views -->
      <div v-if="views.length > 0" class="max-h-72 overflow-y-auto border-t border-surface-100 dark:border-surface-800">
        <div
          v-for="v in views"
          :key="v.id"
          class="factory-saved-views-row group flex items-center gap-1 pl-3 pr-1.5 py-1.5 text-sm transition-colors"
          :class="{ 'is-active': activeViewId === v.id }"
        >
          <button
            type="button"
            class="factory-saved-views-option flex-1 flex items-center gap-2 text-left min-w-0 py-0.5"
            :class="{ 'is-active': activeViewId === v.id }"
            @click="selectView(v.id)"
          >
            <Check class="size-3.5 shrink-0" :class="activeViewId === v.id ? '' : 'opacity-0'" />
            <Star
              v-if="v.isDefault"
              class="size-3.5 shrink-0 text-amber-500 fill-current"
              title="Default view"
            />
            <span class="truncate flex-1">{{ v.name }}</span>
          </button>

          <!-- Save changes -->
          <button
            v-if="activeViewId === v.id && isDirty"
            type="button"
            class="rounded p-1 text-surface-400 hover:text-success-600 hover:bg-success-50 dark:hover:bg-success-950 transition-colors"
            title="Save current changes to this view"
            @click="(e) => onUpdate(v.id, e)"
          >
            <Check class="size-3.5" />
          </button>
          <!-- Set default -->
          <button
            type="button"
            class="rounded p-1 text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            :class="v.isDefault ? 'text-amber-500' : 'opacity-0 group-hover:opacity-100 hover:text-amber-500'"
            :title="v.isDefault ? 'Remove as default' : 'Set as default'"
            @click="(e) => onSetDefault(v.id, v.isDefault, e)"
          >
            <Star class="size-3.5" :class="v.isDefault ? 'fill-current' : ''" />
          </button>
          <!-- Delete -->
          <button
            type="button"
            class="rounded p-1 text-surface-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete view"
            @click="(e) => onDelete(v.id, e)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      </div>

      <!-- Footer: save form -->
      <div class="factory-saved-views-footer border-t p-2">
        <form v-if="showSaveForm" class="flex items-center gap-1.5" @submit.prevent="submitSave">
          <input
            ref="nameInput"
            v-model="newName"
            type="text"
            placeholder="View name"
            maxlength="60"
            class="flex-1 rounded-md border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 px-2.5 py-1.5 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            @keydown.escape.prevent="showSaveForm = false; newName = ''"
          />
          <button
            type="submit"
            :disabled="!newName.trim()"
            class="factory-button-cta factory-button-premium rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >Save</button>
        </form>
        <button
          v-else
          type="button"
          class="factory-button-cta factory-toolbar-button w-full flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-sm font-medium transition-colors"
          @click="openSaveForm"
        >
          <Plus class="size-3.5" />
          {{ activeViewId && isDirty ? 'Save as new view' : 'Save current view' }}
        </button>
      </div>
    </div>
    </Teleport>
  </div>
</template>
