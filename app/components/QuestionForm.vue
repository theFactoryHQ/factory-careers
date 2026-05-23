<script setup lang="ts">
import { X, Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  /** If provided, we're editing an existing question */
  question?: {
    id: string
    label: string
    type: string
    description?: string | null
    required: boolean
    options?: string[] | null
  }
}>()

const emit = defineEmits<{
  (e: 'save', data: {
    label: string
    type: string
    description?: string
    required: boolean
    options?: string[]
  }): void
  (e: 'cancel'): void
}>()

const questionTypes = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
  { value: 'file_upload', label: 'File Upload' },
]

const form = ref({
  label: props.question?.label ?? '',
  type: props.question?.type ?? 'short_text',
  description: props.question?.description ?? '',
  required: props.question?.required ?? false,
  options: props.question?.options ?? [''],
})

const errors = ref<Record<string, string>>({})

const isSelectType = computed(() =>
  form.value.type === 'single_select' || form.value.type === 'multi_select',
)

function addOption() {
  form.value.options.push('')
}

function removeOption(index: number) {
  if (form.value.options.length > 1) {
    form.value.options.splice(index, 1)
  }
}

function validate(): boolean {
  errors.value = {}

  if (!form.value.label.trim()) {
    errors.value.label = 'Question label is required'
  }

  if (isSelectType.value) {
    const nonEmpty = form.value.options.filter((o) => o.trim())
    if (nonEmpty.length === 0) {
      errors.value.options = 'At least one option is required for select questions'
    }
  }

  return Object.keys(errors.value).length === 0
}

function handleSubmit() {
  if (!validate()) return

  const data: {
    label: string
    type: string
    description?: string
    required: boolean
    options?: string[]
  } = {
    label: form.value.label.trim(),
    type: form.value.type,
    required: form.value.required,
  }

  if (form.value.description.trim()) {
    data.description = form.value.description.trim()
  }

  if (isSelectType.value) {
    data.options = form.value.options
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
  }

  emit('save', data)
}

const isEditing = computed(() => !!props.question)
</script>

<template>
  <div class="ui-panel-muted p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300">
        {{ isEditing ? 'Edit Question' : 'Add Question' }}
      </h3>
      <button
        type="button"
        class="ui-button ui-button-ghost p-1"
        @click="emit('cancel')"
      >
        <X class="size-4" />
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <!-- Label -->
      <div>
        <label for="q-label" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Question <span class="ui-required-marker">*</span>
        </label>
        <input
          id="q-label"
          v-model="form.label"
          type="text"
          placeholder="e.g. How many years of experience do you have?"
          class="ui-field"
          :class="errors.label ? 'ui-field-invalid' : ''"
        />
        <p v-if="errors.label" class="ui-feedback-danger mt-1 text-xs">{{ errors.label }}</p>
      </div>

      <!-- Type -->
      <div>
        <label for="q-type" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Field Type
        </label>
        <select
          id="q-type"
          v-model="form.type"
          class="ui-field"
        >
          <option v-for="qt in questionTypes" :key="qt.value" :value="qt.value">
            {{ qt.label }}
          </option>
        </select>
      </div>

      <!-- Description / help text -->
      <div>
        <label for="q-desc" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Help Text <span class="text-surface-400 font-normal">(optional)</span>
        </label>
        <input
          id="q-desc"
          v-model="form.description"
          type="text"
          placeholder="Additional context shown below the field"
          class="ui-field"
        />
      </div>

      <!-- Options (for select types) -->
      <div v-if="isSelectType">
        <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Options <span class="ui-required-marker">*</span>
        </label>
        <div class="space-y-2">
          <div v-for="(_, index) in form.options" :key="index" class="flex items-center gap-2">
            <input
              v-model="form.options[index]"
              type="text"
              :placeholder="`Option ${index + 1}`"
              class="ui-field flex-1 py-1.5"
            />
            <button
              type="button"
              class="ui-button ui-button-ghost ui-button-ghost-danger p-1 disabled:opacity-30"
              :disabled="form.options.length <= 1"
              @click="removeOption(index)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          class="ui-inline-link ui-inline-link-brand mt-2 inline-flex items-center gap-1 text-sm"
          @click="addOption"
        >
          <Plus class="size-3.5" />
          Add option
        </button>
        <p v-if="errors.options" class="ui-feedback-danger mt-1 text-xs">{{ errors.options }}</p>
      </div>

      <!-- Required -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="form.required"
          type="checkbox"
          class="ui-checkbox ui-checkbox-brand size-4"
        />
        <span class="text-sm text-surface-700 dark:text-surface-300">Required</span>
      </label>

      <!-- Actions -->
      <div class="flex items-center gap-2 pt-1">
        <button
          type="submit"
          class="ui-button ui-button-primary px-3 py-1.5"
        >
          {{ isEditing ? 'Update' : 'Add Question' }}
        </button>
        <button
          type="button"
          class="ui-button ui-button-secondary px-3 py-1.5"
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</template>
