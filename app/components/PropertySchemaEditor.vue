<script setup lang="ts">
import { GripVertical, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import {
  PROPERTY_COLOR_CLASSES,
  PROPERTY_OPTION_COLORS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  type PropertyDefinition,
  type PropertyEntityType,
  type PropertyOptionColor,
  type PropertySelectOption,
  type PropertyType,
} from '~~/shared/properties'

const props = defineProps<{
  /** Slide-over visibility. */
  open: boolean
  entityType: PropertyEntityType
  /** When set, edits per-job props for this job; otherwise org-global. */
  jobId?: string | null
  /** Optional title override. */
  title?: string
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const toast = useToast()

const {
  definitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  reorderDefinitions,
  refresh,
} = useProperties({
  entityType: () => props.entityType,
  jobId: () => props.jobId ?? null,
  jobOnly: () => Boolean(props.jobId),
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    refresh()
    return
  }
  formMode.value = null
  editingId.value = null
  formError.value = null
  confirmDeleteId.value = null
})

// ─── Form state for create / edit ───
type FormMode = 'create' | 'edit'
const formMode = ref<FormMode | null>(null)
const editingId = ref<string | null>(null)
const formType = ref<PropertyType>('text')
const formName = ref('')
const formDescription = ref('')
const formOptions = ref<PropertySelectOption[]>([])
const formNumberFormat = ref<'plain' | 'percent' | 'currency'>('plain')
const formCurrency = ref('$')
const formError = ref<string | null>(null)
const isSaving = ref(false)

function openCreate() {
  formMode.value = 'create'
  editingId.value = null
  formType.value = 'text'
  formName.value = ''
  formDescription.value = ''
  formOptions.value = []
  formNumberFormat.value = 'plain'
  formCurrency.value = '$'
  formError.value = null
}

function openEdit(def: PropertyDefinition) {
  formMode.value = 'edit'
  editingId.value = def.id
  formType.value = def.type
  formName.value = def.name
  formDescription.value = def.description ?? ''
  const cfg = def.config as { options?: PropertySelectOption[]; format?: 'plain' | 'percent' | 'currency'; currency?: string } | null
  formOptions.value = cfg?.options ? cfg.options.map((o) => ({ ...o })) : []
  formNumberFormat.value = cfg?.format ?? 'plain'
  formCurrency.value = cfg?.currency ?? '$'
  formError.value = null
}

function cancelForm() {
  formMode.value = null
  editingId.value = null
}

const supportsOptions = computed(() => formType.value === 'select' || formType.value === 'multi_select')
const supportsNumberFormat = computed(() => formType.value === 'number')

function addOption() {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  formOptions.value.push({ id, label: '', color: 'gray' })
}

function removeOption(id: string) {
  formOptions.value = formOptions.value.filter((o) => o.id !== id)
}

function buildConfig() {
  if (supportsOptions.value) {
    return { options: formOptions.value.filter((o) => o.label.trim().length > 0) }
  }
  if (supportsNumberFormat.value) {
    if (formNumberFormat.value === 'currency') return { format: 'currency', currency: formCurrency.value || '$' }
    return { format: formNumberFormat.value }
  }
  return null
}

async function submitForm() {
  formError.value = null
  if (!formName.value.trim()) {
    formError.value = 'Name is required'
    return
  }
  isSaving.value = true
  try {
    if (formMode.value === 'create') {
      await createDefinition({
        entityType: props.entityType,
        type: formType.value,
        name: formName.value.trim(),
        description: formDescription.value.trim() || null,
        jobId: props.jobId ?? null,
        config: buildConfig(),
      })
    } else if (formMode.value === 'edit' && editingId.value) {
      await updateDefinition(editingId.value, {
        name: formName.value.trim(),
        description: formDescription.value.trim() || null,
        config: buildConfig(),
      })
    }
    formMode.value = null
    editingId.value = null
    emit('changed')
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string }; statusMessage?: string })?.data?.statusMessage
      ?? (err as { statusMessage?: string }).statusMessage
      ?? 'Failed to save property'
    formError.value = message
  } finally {
    isSaving.value = false
  }
}

const confirmDeleteId = ref<string | null>(null)
const isDeleting = ref(false)

async function confirmDelete() {
  if (!confirmDeleteId.value) return
  isDeleting.value = true
  try {
    await deleteDefinition(confirmDeleteId.value)
    confirmDeleteId.value = null
    emit('changed')
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Failed to delete'
    toast.error(message)
  } finally {
    isDeleting.value = false
  }
}

// ─── Drag-to-reorder ───
const dragId = ref<string | null>(null)

function onDragStart(id: string) {
  dragId.value = id
}

async function onDrop(targetId: string) {
  if (!dragId.value || dragId.value === targetId) return
  const ids = definitions.value.map((d) => d.id)
  const fromIdx = ids.indexOf(dragId.value)
  const toIdx = ids.indexOf(targetId)
  if (fromIdx < 0 || toIdx < 0) return
  ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]!)
  dragId.value = null
  try {
    await reorderDefinitions(ids)
    emit('changed')
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Failed to reorder'
    toast.error(message)
  }
}

const overlayTitle = computed(() => {
  if (props.title) return props.title
  const scope = props.jobId ? 'Job-specific' : 'Organization'
  const noun = props.entityType === 'candidate' ? 'candidate' : 'application'
  return `${scope} ${noun} properties`
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[65]" @click="emit('close')" />
    </Transition>
    <Transition name="slide-right">
      <aside
        v-if="open"
        class="factory-dashboard-portal ui-drawer-panel fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col"
      >
        <header class="ui-drawer-header flex items-center justify-between px-5 py-4">
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-50 truncate">{{ overlayTitle }}</h2>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {{ jobId ? 'Visible only on applications to this job.' : 'Visible everywhere in your workspace.' }}
            </p>
          </div>
          <button class="ui-button ui-button-ghost p-1.5" @click="emit('close')">
            <X class="size-4" />
          </button>
        </header>

        <div class="ui-drawer-body flex-1 overflow-y-auto">
          <!-- List existing definitions -->
          <ul class="ui-list-divider">
            <li
              v-for="def in definitions"
              :key="def.id"
              draggable="true"
              class="ui-list-row flex items-center gap-2 px-3 py-2"
              @dragstart="onDragStart(def.id)"
              @dragover.prevent
              @drop.prevent="onDrop(def.id)"
            >
              <GripVertical class="size-4 text-surface-300 dark:text-surface-600 cursor-grab active:cursor-grabbing" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{{ def.name }}</span>
                  <span class="ui-pill px-1.5 py-0.5 text-[10px] font-medium uppercase text-surface-500 dark:text-surface-400">
                    {{ PROPERTY_TYPE_LABELS[def.type] }}
                  </span>
                </div>
                <p v-if="def.description" class="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">{{ def.description }}</p>
              </div>
              <button class="ui-button ui-button-ghost p-1.5" @click="openEdit(def)">
                <Pencil class="size-3.5" />
              </button>
              <button class="ui-button ui-button-ghost ui-button-ghost-danger p-1.5" @click="confirmDeleteId = def.id">
                <Trash2 class="size-3.5" />
              </button>
            </li>
          </ul>

          <div v-if="definitions.length === 0 && formMode !== 'create'" class="ui-empty-state px-5 py-10 text-center">
            <p class="text-sm">No properties yet.</p>
            <p class="text-xs mt-1">Add one to start tracking custom data.</p>
          </div>

          <!-- Add / edit form -->
          <div v-if="formMode" class="ui-panel-muted ui-panel-subsection px-5 py-4">
            <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-3">
              {{ formMode === 'create' ? 'New property' : 'Edit property' }}
            </h3>

            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Name</label>
                <input
                  v-model="formName"
                  type="text"
                  maxlength="80"
                  class="ui-field px-2.5 py-1.5 text-sm"
                />
              </div>

              <div v-if="formMode === 'create'">
                <label class="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Type</label>
                <select
                  v-model="formType"
                  class="ui-field px-2.5 py-1.5 text-sm"
                >
                  <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] }}</option>
                </select>
                <p class="text-[11px] text-surface-400 mt-1">Type cannot be changed after creation.</p>
              </div>

              <div>
                <label class="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Description (optional)</label>
                <input
                  v-model="formDescription"
                  type="text"
                  maxlength="500"
                  class="ui-field px-2.5 py-1.5 text-sm"
                />
              </div>

              <!-- Number format -->
              <div v-if="supportsNumberFormat">
                <label class="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Format</label>
                <div class="flex items-center gap-2">
                  <select
                    v-model="formNumberFormat"
                    class="ui-field w-auto px-2 py-1 text-sm"
                  >
                    <option value="plain">Plain</option>
                    <option value="percent">Percent</option>
                    <option value="currency">Currency</option>
                  </select>
                  <input
                    v-if="formNumberFormat === 'currency'"
                    v-model="formCurrency"
                    type="text"
                    maxlength="8"
                    placeholder="$"
                    class="ui-field w-20 px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <!-- Options editor -->
              <div v-if="supportsOptions">
                <label class="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Options</label>
                <ul class="space-y-1.5">
                  <li v-for="opt in formOptions" :key="opt.id" class="flex items-center gap-1.5">
                    <select
                      v-model="opt.color"
                      class="ui-field w-auto shrink-0 px-1 py-0.5 text-xs"
                    >
                      <option v-for="c in PROPERTY_OPTION_COLORS" :key="c" :value="c">{{ c }}</option>
                    </select>
                    <input
                      v-model="opt.label"
                      type="text"
                      maxlength="80"
                      class="ui-field flex-1 min-w-0 px-2 py-1 text-sm"
                      placeholder="Option label"
                    />
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="PROPERTY_COLOR_CLASSES[opt.color as PropertyOptionColor].chip">
                      {{ opt.label || '—' }}
                    </span>
                    <button class="ui-button ui-button-ghost ui-button-ghost-danger p-1" @click="removeOption(opt.id)">
                      <X class="size-3.5" />
                    </button>
                  </li>
                </ul>
                <button
                  type="button"
                  class="ui-inline-link ui-inline-link-brand mt-2 inline-flex items-center gap-1 text-xs"
                  @click="addOption"
                >
                  <Plus class="size-3.5" /> Add option
                </button>
              </div>

              <p v-if="formError" class="ui-feedback-danger text-xs">{{ formError }}</p>

              <div class="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  class="ui-button ui-button-secondary px-3 py-1.5 text-xs"
                  @click="cancelForm"
                >Cancel</button>
                <button
                  type="button"
                  :disabled="isSaving"
                  class="ui-button ui-button-primary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="submitForm"
                >{{ isSaving ? 'Saving…' : (formMode === 'create' ? 'Create' : 'Save') }}</button>
              </div>
            </div>
          </div>
        </div>

        <footer v-if="!formMode" class="ui-panel-footer px-5 py-3">
          <button
            type="button"
            class="ui-button ui-button-secondary w-full border-dashed px-3 py-2 text-sm"
            @click="openCreate"
          >
            <Plus class="size-4" /> Add property
          </button>
        </footer>
      </aside>
    </Transition>

    <!-- Delete confirmation -->
    <Transition name="fade">
      <div
        v-if="confirmDeleteId"
        class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center"
        @click.self="confirmDeleteId = null"
      >
        <div class="ui-modal-panel max-w-sm w-full mx-4 p-6">
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-50 mb-2">Delete property?</h3>
          <p class="text-sm text-surface-600 dark:text-surface-300 mb-4">
            This deletes the property and removes it from all rows. This cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="ui-button ui-button-secondary px-3 py-1.5 text-sm"
              :disabled="isDeleting"
              @click="confirmDeleteId = null"
            >Cancel</button>
            <button
              class="ui-button ui-button-danger px-3 py-1.5 text-sm disabled:opacity-50"
              :disabled="isDeleting"
              @click="confirmDelete"
            >{{ isDeleting ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.22s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
