<script setup lang="ts">
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
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
const panelRef = ref<HTMLElement | null>(null)

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

useFocusTrap({
  root: panelRef,
  active: computed(() => props.open),
  onEscape: () => emit('close'),
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
    toast.error('Failed to save property', { message })
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

async function moveDefinition(id: string, direction: -1 | 1) {
  const ids = definitions.value.map((d) => d.id)
  const fromIdx = ids.indexOf(id)
  const toIdx = fromIdx + direction
  if (fromIdx < 0 || toIdx < 0 || toIdx >= ids.length) return
  const [moved] = ids.splice(fromIdx, 1)
  if (!moved) return
  ids.splice(toIdx, 0, moved)
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
      <div v-if="open" class="fixed inset-0 z-[65] bg-black/72 backdrop-blur-sm" @click="emit('close')" />
    </Transition>
    <Transition name="slide-right">
      <aside
        v-if="open"
        ref="panelRef"
        class="factory-dashboard-portal fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col border-l border-white/12 bg-black text-white shadow-2xl shadow-black/70"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="overlayTitle"
      >
        <header class="flex items-center justify-between border-b border-white/12 bg-black px-5 py-4">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-white">{{ overlayTitle }}</h2>
            <p class="mt-0.5 text-xs text-white/52">
              {{ jobId ? 'Visible only on applications to this job.' : 'Visible everywhere in your workspace.' }}
            </p>
          </div>
          <button
            class="ui-panel-close-button inline-flex h-9 min-h-9 w-9 cursor-pointer items-center justify-center p-0 transition-colors"
            aria-label="Close properties"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto bg-black">
          <!-- List existing definitions -->
          <ul class="divide-y divide-white/10">
            <li
              v-for="def in definitions"
              :key="def.id"
              draggable="true"
              class="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.04]"
              @dragstart="onDragStart(def.id)"
              @dragover.prevent
              @drop.prevent="onDrop(def.id)"
            >
              <GripVertical class="size-4 cursor-grab text-white/32 active:cursor-grabbing" />
              <div class="flex shrink-0 flex-col">
                <button
                  type="button"
                  class="inline-flex h-4 w-6 cursor-pointer items-center justify-center text-white/40 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="Move property up"
                  :disabled="definitions[0]?.id === def.id"
                  @click="moveDefinition(def.id, -1)"
                >
                  <ArrowUp class="size-3" />
                </button>
                <button
                  type="button"
                  class="inline-flex h-4 w-6 cursor-pointer items-center justify-center text-white/40 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="Move property down"
                  :disabled="definitions[definitions.length - 1]?.id === def.id"
                  @click="moveDefinition(def.id, 1)"
                >
                  <ArrowDown class="size-3" />
                </button>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium text-white">{{ def.name }}</span>
                  <span class="border border-white/10 bg-white/[0.045] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/54">
                    {{ PROPERTY_TYPE_LABELS[def.type] }}
                  </span>
                </div>
                <p v-if="def.description" class="mt-0.5 truncate text-xs text-white/46">{{ def.description }}</p>
              </div>
              <button
                class="inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-transparent text-white/48 transition-colors hover:border-white/16 hover:bg-white/[0.055] hover:text-white"
                aria-label="Edit property"
                @click="openEdit(def)"
              >
                <Pencil class="size-3.5" />
              </button>
              <button
                class="inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-transparent text-white/48 transition-colors hover:border-danger-500/45 hover:bg-danger-500/12 hover:text-danger-300"
                aria-label="Delete property"
                @click="confirmDeleteId = def.id"
              >
                <Trash2 class="size-3.5" />
              </button>
            </li>
          </ul>

          <div v-if="definitions.length === 0 && formMode !== 'create'" class="px-5 py-10 text-center">
            <p class="text-sm text-white/68">No properties yet.</p>
            <p class="mt-1 text-xs text-white/42">Add one to start tracking custom data.</p>
          </div>

          <!-- Add / edit form -->
          <div v-if="formMode" class="border-t border-white/12 bg-white/[0.025] px-5 py-4">
            <h3 class="mb-3 text-sm font-semibold text-white">
              {{ formMode === 'create' ? 'New property' : 'Edit property' }}
            </h3>

            <div class="space-y-3">
              <div>
                <label class="mb-1 block text-xs font-medium text-white/68">Name</label>
                <input
                  v-model="formName"
                  type="text"
                  maxlength="80"
                  class="w-full border border-white/16 bg-black/55 px-2.5 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-white/34 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div v-if="formMode === 'create'">
                <label class="mb-1 block text-xs font-medium text-white/68">Type</label>
                <FactorySelect
                  v-model="formType"
                  :options="PROPERTY_TYPES.map(t => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))"
                />
                <p class="mt-1 text-[11px] text-white/38">Type cannot be changed after creation.</p>
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-white/68">Description (optional)</label>
                <input
                  v-model="formDescription"
                  type="text"
                  maxlength="500"
                  class="w-full border border-white/16 bg-black/55 px-2.5 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-white/34 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <!-- Number format -->
              <div v-if="supportsNumberFormat">
                <label class="mb-1 block text-xs font-medium text-white/68">Format</label>
                <div class="flex items-center gap-2">
                  <FactorySelect
                    v-model="formNumberFormat"
                    class="flex-1"
                    :options="[
                      { value: 'plain', label: 'Plain' },
                      { value: 'percent', label: 'Percent' },
                      { value: 'currency', label: 'Currency' },
                    ]"
                  />
                  <input
                    v-if="formNumberFormat === 'currency'"
                    v-model="formCurrency"
                    type="text"
                    maxlength="8"
                    placeholder="$"
                    class="w-20 border border-white/16 bg-black/55 px-2 py-1 text-sm text-white outline-none transition-colors placeholder:text-white/34 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <!-- Options editor -->
              <div v-if="supportsOptions">
                <label class="mb-1 block text-xs font-medium text-white/68">Options</label>
                <ul class="space-y-1.5">
                  <li v-for="opt in formOptions" :key="opt.id" class="flex items-center gap-1.5">
                    <FactorySelect
                      v-model="opt.color"
                      class="w-24 shrink-0"
                      :options="PROPERTY_OPTION_COLORS.map(c => ({ value: c, label: c }))"
                    />
                    <input
                      v-model="opt.label"
                      type="text"
                      maxlength="80"
                      class="min-w-0 flex-1 border border-white/16 bg-black/55 px-2 py-1 text-sm text-white outline-none transition-colors placeholder:text-white/34 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      placeholder="Option label"
                    />
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="PROPERTY_COLOR_CLASSES[opt.color as PropertyOptionColor].chip">
                      {{ opt.label || '—' }}
                    </span>
                    <button
                      class="inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-transparent text-white/48 transition-colors hover:border-danger-500/45 hover:bg-danger-500/12 hover:text-danger-300"
                      aria-label="Remove option"
                      @click="removeOption(opt.id)"
                    >
                      <X class="size-3.5" />
                    </button>
                  </li>
                </ul>
                <button
                  type="button"
                  class="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium uppercase text-brand-300 transition-colors hover:text-white"
                  @click="addOption"
                >
                  <Plus class="size-3.5" /> Add option
                </button>
              </div>

              <p v-if="formError" class="text-xs text-danger-300">{{ formError }}</p>

              <div class="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  class="factory-toolbar-button inline-flex h-10 min-h-10 cursor-pointer items-center justify-center border px-3.5 py-0 text-xs font-medium transition-colors"
                  @click="cancelForm"
                >Cancel</button>
                <button
                  type="button"
                  :disabled="isSaving"
                  class="factory-button-cta factory-button-premium inline-flex h-10 min-h-10 cursor-pointer items-center justify-center px-3.5 py-0 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  @click="submitForm"
                >{{ isSaving ? 'Saving…' : (formMode === 'create' ? 'Create' : 'Save') }}</button>
              </div>
            </div>
          </div>
        </div>

        <footer v-if="!formMode" class="border-t border-white/12 bg-black px-5 py-3">
          <button
            type="button"
            class="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 border border-dashed border-white/18 bg-black/55 px-3 py-2 text-sm font-medium uppercase text-white/72 transition-colors hover:border-brand-500 hover:bg-brand-500/12 hover:text-white"
            @click="openCreate"
          >
            <Plus class="size-4" /> Add property
          </button>
        </footer>
      </aside>
    </Transition>

    <!-- Delete confirmation -->
    <Transition name="fade">
      <div v-if="confirmDeleteId" class="fixed inset-0 z-[80] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/78 backdrop-blur-sm" @click="confirmDeleteId = null" />
        <div class="factory-dashboard-portal relative mx-4 w-full max-w-sm border border-white/12 bg-black p-6 text-white shadow-2xl shadow-black/70">
          <h3 class="mb-2 text-base font-semibold text-white">Delete property?</h3>
          <p class="mb-4 text-sm text-white/58">
            This deletes the property and removes it from all rows. This cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="factory-toolbar-button cursor-pointer border px-3 py-1.5 text-sm font-medium transition-colors"
              :disabled="isDeleting"
              @click="confirmDeleteId = null"
            >Cancel</button>
            <button
              class="factory-button-cta cursor-pointer border border-danger-500/60 bg-danger-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-50"
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
