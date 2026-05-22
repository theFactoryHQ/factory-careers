<script setup lang="ts">
import { X, RotateCcw, Bookmark, Plus, Check } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: boolean
  title?: string
  description?: string
  activeCount?: number
  /** Show the "Save as view" affordance in the footer. */
  saveable?: boolean
  /** Suggested default name when saving a new view. */
  defaultSaveName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'reset': []
  'save-view': [name: string]
}>()

function close() {
  emit('update:modelValue', false)
}

const showSaveForm = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

async function openSaveForm() {
  showSaveForm.value = true
  newName.value = props.defaultSaveName ?? 'New view'
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function submitSave() {
  const name = newName.value.trim()
  if (!name) return
  emit('save-view', name)
  showSaveForm.value = false
  newName.value = ''
}

// Reset save form when drawer closes
watch(() => props.modelValue, (open) => {
  if (!open) {
    showSaveForm.value = false
    newName.value = ''
  }
})

// Lock body scroll while open
watch(() => props.modelValue, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

// Close on Escape
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="ui-modal-backdrop fixed inset-0 z-[55]"
        @click="close"
      />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      leave-active-class="transition-transform duration-200 ease-in"
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="modelValue"
        class="factory-dashboard-portal ui-drawer-panel ui-filter-drawer fixed inset-y-0 right-0 z-[60] w-full max-w-md flex flex-col"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Filters'"
      >
        <!-- Header -->
        <header class="ui-drawer-header flex items-start justify-between gap-3 px-5 py-4">
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
              {{ title || 'Filters' }}
              <span
                v-if="activeCount && activeCount > 0"
                class="ui-filter-count"
              >{{ activeCount }}</span>
            </h2>
            <p v-if="description" class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {{ description }}
            </p>
          </div>
          <button
            type="button"
            class="ui-button ui-button-ghost shrink-0 p-1.5"
            aria-label="Close"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </header>

        <!-- Body (scrollable) -->
        <div class="ui-drawer-body ui-filter-drawer-body flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>

        <!-- Footer -->
        <footer class="ui-panel-footer">
          <!-- Inline save-view form -->
          <div v-if="saveable && showSaveForm" class="ui-panel-divider flex items-center gap-2 px-5 py-3">
            <Bookmark class="ui-icon-brand size-4 shrink-0" />
            <input
              ref="nameInput"
              v-model="newName"
              type="text"
              placeholder="Name this view"
              maxlength="60"
              class="ui-field flex-1 px-2.5 py-1.5 text-sm"
              @keydown.enter.prevent="submitSave"
              @keydown.escape.prevent="showSaveForm = false; newName = ''"
            />
            <button
              type="button"
              :disabled="!newName.trim()"
              class="ui-button ui-button-primary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              @click="submitSave"
            >
              <Check class="size-3.5" />
              Save
            </button>
            <button
              type="button"
              class="ui-button ui-button-ghost p-1.5"
              aria-label="Cancel"
              @click="showSaveForm = false; newName = ''"
            >
              <X class="size-3.5" />
            </button>
          </div>

          <div class="flex items-center justify-between gap-2 px-5 py-3">
            <button
              type="button"
              class="ui-inline-link ui-inline-link-muted inline-flex items-center gap-1.5 text-xs font-medium"
              @click="emit('reset')"
            >
              <RotateCcw class="size-3.5" />
              Reset all
            </button>
            <div class="flex items-center gap-2">
              <button
                v-if="saveable && !showSaveForm"
                type="button"
                class="ui-button ui-button-secondary px-3 py-2 text-sm"
                @click="openSaveForm"
              >
                <Plus class="size-3.5" />
                Save as view
              </button>
              <slot name="footer">
                <button
                  type="button"
                  class="ui-button ui-button-primary px-4 py-2 text-sm"
                  @click="close"
                >
                  Done
                </button>
              </slot>
            </div>
          </div>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
