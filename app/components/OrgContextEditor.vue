<script setup lang="ts">
import { AlertTriangle, Check, Loader2, Pencil } from 'lucide-vue-next'

const MAX_CONTEXT_LENGTH = 4000
const AUTOSAVE_DELAY_MS = 900

const { allowed: canUpdateOrg } = usePermission({ organization: ['update'] })
const toast = useToast()
const { analysisContext, updateSettings } = useOrgSettings()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isEditing = ref(false)
const localContext = ref('')
const lastSavedContext = ref('')
const isSaving = ref(false)
const saveStatus = ref<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null

watch(analysisContext, (context) => {
  lastSavedContext.value = context

  if (!isEditing.value || (saveStatus.value !== 'dirty' && saveStatus.value !== 'saving')) {
    localContext.value = context
  }
}, { immediate: true })

watch(localContext, () => {
  if (isEditing.value) scheduleSave()
})

watch(canUpdateOrg, (allowed) => {
  if (allowed && isEditing.value) scheduleSave()
})

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})

const displayContext = computed(() => localContext.value.trim())
const characterCount = computed(() => localContext.value.length)

const saveLabel = computed(() => {
  if (!canUpdateOrg.value) return 'View only'
  if (!isEditing.value) return 'Locked'

  switch (saveStatus.value) {
    case 'dirty': return 'Unsaved changes'
    case 'saving': return 'Saving...'
    case 'saved': return 'Saved'
    case 'error': return saveError.value || 'Save failed'
    default: return 'Autosaves'
  }
})

const saveLabelClass = computed(() => {
  if (saveStatus.value === 'error') return 'text-danger-500 dark:text-danger-400'
  if (saveStatus.value === 'dirty') return 'text-warning-500 dark:text-warning-400'
  return 'text-surface-500 dark:text-surface-400'
})

async function startEditing() {
  if (!canUpdateOrg.value) return
  isEditing.value = true
  await nextTick()
  textareaRef.value?.focus()
}

function finishEditing() {
  if (saveStatus.value === 'dirty') {
    void saveContext()
  }
  isEditing.value = false
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)

  saveError.value = ''
  if (localContext.value === lastSavedContext.value) {
    saveStatus.value = 'idle'
    return
  }

  saveStatus.value = 'dirty'
  if (!canUpdateOrg.value) return

  saveTimer = setTimeout(() => {
    void saveContext()
  }, AUTOSAVE_DELAY_MS)
}

async function saveContext() {
  if (!canUpdateOrg.value) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  const contextToSave = localContext.value
  if (contextToSave === lastSavedContext.value) {
    saveStatus.value = 'idle'
    return
  }

  isSaving.value = true
  saveStatus.value = 'saving'
  try {
    await updateSettings({ analysisContext: contextToSave })
    lastSavedContext.value = contextToSave
    saveStatus.value = localContext.value === contextToSave ? 'saved' : 'dirty'
    if (localContext.value !== contextToSave && isEditing.value) scheduleSave()
  }
  catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message ?? 'Failed to save org context.'
    saveStatus.value = 'error'
    saveError.value = message
    toast.error('Save failed', { message })
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="mb-5 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Org Context</h2>
      <div class="flex items-center gap-3">
        <p
          class="inline-flex items-center gap-1.5 text-[11px]"
          :class="saveLabelClass"
        >
          <Loader2 v-if="isSaving" class="size-3 animate-spin" />
          <Check v-else-if="saveStatus === 'saved'" class="size-3" />
          <AlertTriangle v-else-if="saveStatus === 'error'" class="size-3" />
          {{ saveLabel }}
        </p>
        <button
          v-if="canUpdateOrg"
          type="button"
          class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
          @click="isEditing ? finishEditing() : startEditing()"
        >
          <Check v-if="isEditing" class="size-3.5" />
          <Pencil v-else class="size-3.5" />
          {{ isEditing ? 'Done' : 'Edit' }}
        </button>
      </div>
    </div>

    <div class="ui-panel ui-dashboard-panel px-5 py-4 space-y-3">
      <textarea
        v-if="isEditing"
        ref="textareaRef"
        v-model="localContext"
        rows="5"
        :maxlength="MAX_CONTEXT_LENGTH"
        class="ui-field min-h-32 resize-y"
        placeholder="Describe the org, customers, services, and domain signals candidates should be evaluated against."
        @blur="saveContext"
      />
      <div
        v-else
        class="min-h-24 whitespace-pre-wrap text-sm leading-6 text-surface-700 dark:text-surface-200"
      >
        <span v-if="displayContext">{{ localContext }}</span>
        <span v-else class="text-surface-500 dark:text-surface-400">
          Describe the org, customers, services, and domain signals candidates should be evaluated against.
        </span>
      </div>

      <p class="text-[11px] text-surface-500 dark:text-surface-400">
        {{ characterCount.toLocaleString() }} / {{ MAX_CONTEXT_LENGTH.toLocaleString() }} characters
      </p>
    </div>
  </section>
</template>
