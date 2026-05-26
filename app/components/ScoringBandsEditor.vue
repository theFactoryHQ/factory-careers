<script setup lang="ts">
import { Check, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-vue-next'
import {
  DEFAULT_SCORING_BANDS,
  normalizeScoringBands,
  type ScoringBand,
  type ScoringBandColor,
} from '~~/shared/scoring-bands'

const props = defineProps<{
  mode: 'global' | 'job'
  jobId?: string
}>()

const toast = useToast()

interface OrgScoringBandSettings {
  scoringBands: ScoringBand[]
}

interface JobScoringBandSettings {
  scoringBands: ScoringBand[] | null
}

const { data: orgSettings, refresh: refreshOrgSettings } = useFetch<OrgScoringBandSettings>('/api/org-settings', {
  key: 'org-settings',
  headers: useRequestHeaders(['cookie']),
})

const { data: jobSettings, refresh: refreshJobSettings } = useFetch<JobScoringBandSettings>(
  () => `/api/jobs/${props.jobId ?? '__missing__'}`,
  {
    key: computed(() => props.jobId ? `scoring-band-job-${props.jobId}` : 'scoring-band-job'),
    headers: useRequestHeaders(['cookie']),
    immediate: props.mode === 'job' && !!props.jobId,
  },
)

const colorOptions: { value: ScoringBandColor, label: string }[] = [
  { value: 'danger', label: 'Red' },
  { value: 'warning', label: 'Amber' },
  { value: 'success', label: 'Green' },
  { value: 'neutral', label: 'Neutral' },
]

const isEditing = ref(false)
const isSaving = ref(false)
const useGlobalDefaults = ref(true)
const localBands = ref<ScoringBand[]>([...DEFAULT_SCORING_BANDS])
const cleanSnapshot = ref('')

const globalBands = computed(() => normalizeScoringBands(orgSettings.value?.scoringBands ?? DEFAULT_SCORING_BANDS))
const jobBands = computed(() => normalizeScoringBands(jobSettings.value?.scoringBands ?? []))
const hasJobOverride = computed(() => Array.isArray(jobSettings.value?.scoringBands) && jobSettings.value.scoringBands.length > 0)

function markClean() {
  cleanSnapshot.value = JSON.stringify({
    useGlobalDefaults: useGlobalDefaults.value,
    bands: localBands.value,
  })
}

const hasUnsavedChanges = computed(() =>
  cleanSnapshot.value !== JSON.stringify({
    useGlobalDefaults: useGlobalDefaults.value,
    bands: localBands.value,
  }),
)

function resetLocalState() {
  if (props.mode === 'job') {
    useGlobalDefaults.value = !hasJobOverride.value
    localBands.value = hasJobOverride.value ? jobBands.value : globalBands.value
  } else {
    useGlobalDefaults.value = false
    localBands.value = globalBands.value
  }
  markClean()
}

watch([orgSettings, jobSettings], resetLocalState, { immediate: true })

function addBand() {
  if (localBands.value.length >= 6) return
  const previousMax = localBands.value.at(-1)?.maxScore ?? -1
  const minScore = Math.min(100, previousMax + 1)
  localBands.value.push({
    label: 'New Band',
    minScore,
    maxScore: 100,
    color: 'neutral',
  })
}

function removeBand(index: number) {
  if (localBands.value.length <= 1) return
  localBands.value.splice(index, 1)
}

function restoreDefaults() {
  localBands.value = props.mode === 'job' ? globalBands.value : [...DEFAULT_SCORING_BANDS]
}

async function saveBands() {
  isSaving.value = true
  try {
    const bands = normalizeScoringBands(localBands.value)
    if (props.mode === 'job') {
      await $fetch(`/api/jobs/${props.jobId}`, {
        method: 'PATCH',
        body: { scoringBands: useGlobalDefaults.value ? null : bands },
      })
      await refreshJobSettings()
      toast.success('Scoring bands updated', useGlobalDefaults.value ? 'This job uses the global defaults.' : 'This job uses custom scoring bands.')
    } else {
      await $fetch('/api/org-settings', {
        method: 'PATCH',
        body: { scoringBands: bands },
      })
      await refreshOrgSettings()
      toast.success('Scoring bands updated', 'Global defaults saved.')
    }
    localBands.value = bands
    markClean()
    isEditing.value = false
  } catch (err: any) {
    toast.error('Failed to save scoring bands', { message: err?.data?.statusMessage })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="mb-5 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Scoring Bands</h2>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-surface-500">
          Informational
        </span>
        <button
          v-if="!isEditing"
          type="button"
          class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
          @click="isEditing = true"
        >
          <Pencil class="size-3.5" />
          Edit
        </button>
      </div>
    </div>

    <div class="ui-panel ui-dashboard-panel px-5 py-4">
      <label
        v-if="mode === 'job'"
        class="mb-4 flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300"
      >
        <input
          v-model="useGlobalDefaults"
          type="checkbox"
          :disabled="!isEditing"
          class="size-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
        />
        Use global defaults
      </label>

      <div class="space-y-2">
        <div
          v-for="(band, index) in localBands"
          :key="index"
          class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_7rem_auto] sm:items-center"
          :class="{ 'opacity-55': mode === 'job' && useGlobalDefaults }"
        >
          <input
            v-model="band.label"
            type="text"
            :disabled="!isEditing || (mode === 'job' && useGlobalDefaults)"
            class="ui-field h-9 text-sm"
            aria-label="Band label"
          />
          <input
            v-model.number="band.minScore"
            type="number"
            min="0"
            max="100"
            :disabled="!isEditing || (mode === 'job' && useGlobalDefaults)"
            class="ui-field h-9 text-sm"
            aria-label="Minimum score"
          />
          <input
            v-model.number="band.maxScore"
            type="number"
            min="0"
            max="100"
            :disabled="!isEditing || (mode === 'job' && useGlobalDefaults)"
            class="ui-field h-9 text-sm"
            aria-label="Maximum score"
          />
          <FactorySelect
            v-model="band.color"
            :disabled="!isEditing || (mode === 'job' && useGlobalDefaults)"
            :options="colorOptions"
          />
          <button
            v-if="isEditing && !(mode === 'job' && useGlobalDefaults)"
            type="button"
            class="ui-button ui-button-danger-outline h-9 px-2"
            :disabled="localBands.length <= 1"
            aria-label="Remove band"
            @click="removeBand(index)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      </div>

      <div
        v-if="isEditing"
        class="mt-4 flex flex-wrap items-center gap-2"
      >
        <button
          v-if="!(mode === 'job' && useGlobalDefaults)"
          type="button"
          class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
          :disabled="localBands.length >= 6"
          @click="addBand"
        >
          <Plus class="size-3.5" />
          Add band
        </button>
        <button
          v-if="!(mode === 'job' && useGlobalDefaults)"
          type="button"
          class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
          @click="restoreDefaults"
        >
          <RotateCcw class="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          class="ui-button ui-button-primary h-8 px-3 text-xs"
          :disabled="isSaving || !hasUnsavedChanges"
          @click="saveBands"
        >
          <Loader2 v-if="isSaving" class="size-3.5 animate-spin" />
          <Check v-else class="size-3.5" />
          Done
        </button>
        <button
          type="button"
          class="ui-button ui-button-secondary h-8 px-2.5 text-xs"
          :disabled="isSaving"
          @click="resetLocalState(); isEditing = false"
        >
          Cancel
        </button>
      </div>
    </div>
  </section>
</template>
