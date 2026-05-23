<script setup lang="ts">
import { ChevronDown, Upload, X } from 'lucide-vue-next'

/**
 * Renders a custom question as the appropriate form field based on its type.
 * Used on the public application form to display recruiter-configured questions.
 *
 * For `file_upload` type questions, emits `file-selected` with the File object.
 * The model value will be set to `"pending:<filename>"` to track selection state.
 */
const props = defineProps<{
  question: {
    id: string
    type: string
    label: string
    description?: string | null
    required: boolean
    options?: string[] | null
  }
  error?: string
}>()

const emit = defineEmits<{
  (e: 'file-selected', questionId: string, file: File | null): void
}>()

const model = defineModel<string | string[] | number | boolean | undefined>()

// String-coerced model for text inputs (avoids TS error with boolean in v-model on <input>)
const stringModel = computed({
  get: () => (model.value as string) ?? '',
  set: (v: string) => { model.value = v },
})

const numberModel = computed({
  get: () => (model.value as number) ?? undefined,
  set: (v: number) => { model.value = v },
})

const booleanModel = computed({
  get: () => (model.value as boolean) ?? false,
  set: (v: boolean) => { model.value = v },
})

// For multi_select, ensure model value is always an array
if (props.question.type === 'multi_select' && !Array.isArray(model.value)) {
  model.value = []
}

// For checkbox, ensure model value is always a boolean
if (props.question.type === 'checkbox' && typeof model.value !== 'boolean') {
  model.value = false
}

function toggleMultiOption(option: string) {
  const current = Array.isArray(model.value) ? [...model.value] : []
  const idx = current.indexOf(option)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(option)
  }
  model.value = current
}

function isOptionSelected(option: string): boolean {
  return Array.isArray(model.value) && model.value.includes(option)
}

// ─────────────────────────────────────────────
// File upload handling
// ─────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFileName = ref<string | null>(null)

/** Accepted file types for file_upload questions */
const acceptedFileTypes = '.pdf,.doc,.docx'

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null

  if (file) {
    selectedFileName.value = file.name
    // Store a marker in the model so required-field validation knows a file is selected
    model.value = `pending:${file.name}`
    emit('file-selected', props.question.id, file)
  } else {
    clearFile()
  }
}

function clearFile() {
  selectedFileName.value = null
  model.value = undefined
  emit('file-selected', props.question.id, null)
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const inputClasses = 'w-full border bg-black/35 px-3.5 py-2.5 text-sm text-white placeholder:text-white/38 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25'
const errorBorderClass = 'border-danger-500/70 focus:border-danger-500 focus:ring-danger-500/25'
const normalBorderClass = 'border-white/14'
</script>

<template>
  <div>
    <label :for="`q-${question.id}`" class="mb-1.5 block text-sm font-medium text-white/70">
      {{ question.label }}
      <span v-if="question.required" class="text-danger-300">*</span>
    </label>

    <!-- Short Text -->
    <input
      v-if="question.type === 'short_text'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      type="text"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Long Text -->
    <textarea
      v-else-if="question.type === 'long_text'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      rows="4"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Single Select -->
    <div v-else-if="question.type === 'single_select'" class="relative">
      <select
        :id="`q-${question.id}`"
        v-model="stringModel"
        :class="[inputClasses, 'appearance-none pr-9', error ? errorBorderClass : normalBorderClass]"
      >
        <option value="" disabled>Select an option…</option>
        <option v-for="opt in question.options" :key="opt" :value="opt">
          {{ opt }}
        </option>
      </select>
      <ChevronDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-brand-500" />
    </div>

    <!-- Multi Select (checkboxes) -->
    <div v-else-if="question.type === 'multi_select'" class="mt-1 space-y-2">
      <label
        v-for="opt in question.options"
        :key="opt"
        class="flex cursor-pointer items-center gap-2"
      >
        <input
          type="checkbox"
          :checked="isOptionSelected(opt)"
          class="size-4 rounded-none border-white/20 bg-black text-brand-500 focus:ring-brand-500"
          @change="toggleMultiOption(opt)"
        />
        <span class="text-sm text-white/70">{{ opt }}</span>
      </label>
    </div>

    <!-- Number -->
    <input
      v-else-if="question.type === 'number'"
      :id="`q-${question.id}`"
      v-model="numberModel"
      type="number"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Date -->
    <input
      v-else-if="question.type === 'date'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      type="date"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- URL -->
    <input
      v-else-if="question.type === 'url'"
      :id="`q-${question.id}`"
      v-model="stringModel"
      type="url"
      placeholder="https://…"
      :class="[inputClasses, error ? errorBorderClass : normalBorderClass]"
    />

    <!-- Checkbox (boolean) -->
    <label v-else-if="question.type === 'checkbox'" class="mt-1 flex cursor-pointer items-center gap-2">
      <input
        :id="`q-${question.id}`"
        v-model="booleanModel"
        type="checkbox"
        class="size-4 rounded-none border-white/20 bg-black text-brand-500 focus:ring-brand-500"
      />
      <span class="text-sm text-white/70">Yes</span>
    </label>

    <!-- File Upload -->
    <div v-else-if="question.type === 'file_upload'" class="mt-1">
      <input
        ref="fileInputRef"
        type="file"
        :accept="acceptedFileTypes"
        class="hidden"
        @change="handleFileChange"
      />

      <!-- No file selected -->
      <button
        v-if="!selectedFileName"
        type="button"
        class="factory-button-cta flex h-[48px] min-h-[48px] w-full items-center justify-center gap-2 border border-dashed px-4 py-0 transition-colors"
        :class="error ? 'border-danger-500/70 bg-danger-500/10 text-danger-300' : 'border-white/14 bg-black/35 text-white/50 hover:border-brand-500/60 hover:text-brand-500'"
        @click="fileInputRef?.click()"
      >
        <Upload class="size-4" />
        Choose file (PDF, DOC, DOCX — max 10 MB)
      </button>

      <!-- File selected -->
      <div
        v-else
        class="flex items-center justify-between border bg-black/35 px-4 py-2.5 text-sm"
        :class="error ? 'border-danger-500/70' : 'border-white/14'"
      >
        <span class="mr-2 truncate text-white">{{ selectedFileName }}</span>
        <button
          type="button"
          class="shrink-0 p-0.5 text-white/45 transition-colors hover:text-danger-300"
          @click="clearFile"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <!-- Help text -->
    <p v-if="question.description" class="mt-1.5 text-xs text-white/40">
      {{ question.description }}
    </p>

    <!-- Error message -->
    <p v-if="error" class="mt-1.5 text-xs text-danger-300">{{ error }}</p>
  </div>
</template>
