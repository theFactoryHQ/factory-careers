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
        class="fixed inset-0 z-[55] bg-black/72"
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
        class="factory-dashboard-portal factory-filter-drawer fixed inset-y-0 right-0 z-[60] w-full max-w-md flex flex-col border-l border-white/12 bg-black text-white shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Filters'"
      >
        <!-- Header -->
        <header class="factory-filter-drawer-header flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-white flex items-center gap-2">
              {{ title || 'Filters' }}
              <span
                v-if="activeCount && activeCount > 0"
                class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-brand-600 text-white text-xs font-semibold"
              >{{ activeCount }}</span>
            </h2>
            <p v-if="description" class="text-xs text-white/52 mt-0.5">
              {{ description }}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 p-1.5 text-white/45 hover:text-white hover:bg-white/[0.07] transition-colors"
            aria-label="Close"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </header>

        <!-- Body (scrollable) -->
        <div class="factory-filter-drawer-body flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>

        <!-- Footer -->
        <footer class="factory-filter-drawer-footer border-t border-white/10 bg-white/[0.04]">
          <!-- Inline save-view form -->
          <div v-if="saveable && showSaveForm" class="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            <Bookmark class="size-4 text-brand-400 shrink-0" />
            <input
              ref="nameInput"
              v-model="newName"
              type="text"
              placeholder="Name this view"
              maxlength="60"
              class="factory-filter-input flex-1 border px-2.5 py-1.5 text-sm focus:outline-none"
              @keydown.enter.prevent="submitSave"
              @keydown.escape.prevent="showSaveForm = false; newName = ''"
            />
            <button
              type="button"
              :disabled="!newName.trim()"
              class="factory-button-cta factory-button-premium factory-button-cta-sm inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              @click="submitSave"
            >
              <Check class="size-3.5" />
              Save
            </button>
            <button
              type="button"
              class="factory-filter-icon-button p-1.5 transition-colors"
              aria-label="Cancel"
              @click="showSaveForm = false; newName = ''"
            >
              <X class="size-3.5" />
            </button>
          </div>

          <div class="flex items-center justify-between gap-2 px-5 py-3">
            <button
              type="button"
              class="factory-filter-reset inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
              @click="emit('reset')"
            >
              <RotateCcw class="size-3.5" />
              Reset all
            </button>
            <div class="flex items-center gap-2">
              <button
                v-if="saveable && !showSaveForm"
                type="button"
                class="factory-filter-secondary inline-flex items-center gap-1.5 border px-3 py-2 text-sm font-medium transition-colors"
                @click="openSaveForm"
              >
                <Plus class="size-3.5" />
                Save as view
              </button>
              <slot name="footer">
                <button
                  type="button"
                  class="factory-button-cta factory-button-premium px-4 py-2 text-sm"
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
