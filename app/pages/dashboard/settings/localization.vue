<script setup lang="ts">
import { Globe, Save, Check, Loader2, ChevronDown } from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Localization Settings — Factory Careers',
  description: 'Configure name display format and date format for your organization',
})

const { allowed: canUpdateOrg } = usePermission({ organization: ['update'] })
const { nameDisplayFormat, dateFormat, updateSettings } = useOrgSettings()
const { track } = useTrack()

const localNameFormat = ref<'first_last' | 'last_first'>('first_last')
const localDateFormat = ref<'mdy' | 'dmy' | 'ymd'>('mdy')

const nameFormatOptions = [
  { value: 'first_last', label: 'First Last', example: 'Jane Doe' },
  { value: 'last_first', label: 'Last First', example: 'Doe Jane' },
] as const

const dateFormatOptions = [
  { value: 'mdy', label: 'MM/DD/YYYY', example: 'United States' },
  { value: 'dmy', label: 'DD/MM/YYYY', example: 'Europe, Vietnam & most regions' },
  { value: 'ymd', label: 'YYYY-MM-DD', example: 'ISO 8601 / East Asia' },
] as const

const selectedNameFormatOption = computed(() =>
  nameFormatOptions.find(option => option.value === localNameFormat.value) ?? nameFormatOptions[0],
)

const selectedDateFormatOption = computed(() =>
  dateFormatOptions.find(option => option.value === localDateFormat.value) ?? dateFormatOptions[0],
)

// Sync from loaded settings
watch([nameDisplayFormat, dateFormat], ([nf, df]) => {
  localNameFormat.value = nf as 'first_last' | 'last_first'
  localDateFormat.value = df as 'mdy' | 'dmy' | 'ymd'
}, { immediate: true })

const isSaving = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

async function handleSave() {
  if (!canUpdateOrg.value) return
  isSaving.value = true
  saveError.value = ''
  saveSuccess.value = false

  try {
    await updateSettings({
      nameDisplayFormat: localNameFormat.value,
      dateFormat: localDateFormat.value,
    })
    track('localization_settings_saved')
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  }
  catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save settings'
  }
  finally {
    isSaving.value = false
  }
}

// Preview helpers
const previewCandidate = { firstName: 'Jane', lastName: 'Doe', displayName: null }
const previewNameFormatted = computed(() => {
  if (localNameFormat.value === 'last_first') return `${previewCandidate.lastName} ${previewCandidate.firstName}`
  return `${previewCandidate.firstName} ${previewCandidate.lastName}`
})

const previewDate = '1990-05-24'
const previewDateFormatted = computed(() => {
  const [year, month, day] = previewDate.split('-')
  switch (localDateFormat.value) {
    case 'dmy': return `${day}/${month}/${year}`
    case 'ymd': return `${year}-${month}-${day}`
    case 'mdy':
    default: return `${month}/${day}/${year}`
  }
})
</script>

<template>
  <div class="ui-settings-page">
    <!-- Page title -->
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        Localization
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        Configure how candidate names and dates are displayed across your organization.
      </p>
    </div>

    <!-- Settings card -->
    <section class="ui-panel ui-settings-panel">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10 shrink-0">
            <Globe class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Display preferences</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Controls name and date formatting for all members of this organization.</p>
          </div>
        </div>
      </div>

      <div class="ui-settings-panel-body space-y-6">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Name display format -->
          <div>
            <label for="localization-name-format" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              Name display format
            </label>
            <FactorySelect
              id="localization-name-format"
              v-model="localNameFormat"
              :options="nameFormatOptions.map(o => ({ value: o.value, label: `${o.label} - ${o.example}` }))"
              :disabled="!canUpdateOrg"
            />
            <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">
              Currently: {{ selectedNameFormatOption.example }}
            </p>
          </div>

          <!-- Date format -->
          <div>
            <label for="localization-date-format" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              Date format
            </label>
            <FactorySelect
              id="localization-date-format"
              v-model="localDateFormat"
              :options="dateFormatOptions.map(o => ({ value: o.value, label: `${o.label} - ${o.example}` }))"
              :disabled="!canUpdateOrg"
            />
            <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">
              {{ selectedDateFormatOption.example }}
            </p>
          </div>
        </div>

        <!-- Live preview -->
        <div class="ui-panel-muted p-4">
          <p class="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">Preview</p>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-surface-400">Name:</span>
              <span class="font-medium text-surface-900 dark:text-surface-100">{{ previewNameFormatted }}</span>
            </div>
            <div class="hidden sm:block text-surface-300 dark:text-surface-600">·</div>
            <div class="flex items-center gap-2">
              <span class="text-surface-400">Date of Birth:</span>
              <span class="font-medium text-surface-900 dark:text-surface-100">{{ previewDateFormatted }}</span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div
          v-if="saveError"
          class="ui-alert ui-alert-danger"
        >
          {{ saveError }}
        </div>

        <!-- Save button -->
        <div class="flex items-center gap-3">
          <button
            :disabled="!canUpdateOrg || isSaving"
            class="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleSave"
          >
            <Check v-if="saveSuccess" class="size-4" />
            <Loader2 v-else-if="isSaving" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            {{ saveSuccess ? 'Saved!' : isSaving ? 'Saving…' : 'Save changes' }}
          </button>
          <p v-if="!canUpdateOrg" class="text-xs text-surface-400">Only admins and owners can change organization settings.</p>
        </div>
      </div>
    </section>
  </div>
</template>
