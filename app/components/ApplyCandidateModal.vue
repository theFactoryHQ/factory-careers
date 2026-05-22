<script setup lang="ts">
import { Search, X, UserPlus } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = withDefaults(defineProps<{
  jobId: string
  teleportTarget?: string | HTMLElement
}>(), {
  teleportTarget: 'body',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created'): void
}>()

// Search for candidates
const searchInput = ref('')
const debouncedSearch = ref<string | undefined>(undefined)

let debounceTimer: ReturnType<typeof setTimeout>
watch(searchInput, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearch.value = val.trim() || undefined
  }, 300)
})

const { data: candidateData, status: searchStatus } = useFetch('/api/candidates', {
  key: 'apply-candidate-search',
  query: computed(() => ({
    ...(debouncedSearch.value && { search: debouncedSearch.value }),
    limit: 20,
  })),
  headers: useRequestHeaders(['cookie']),
})

const candidates = computed(() => candidateData.value?.data ?? [])
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { formatCandidateName } = useOrgSettings()

// Apply candidate
const isApplying = ref(false)
const applyError = ref('')

async function applyCandidate(candidateId: string) {
  isApplying.value = true
  applyError.value = ''
  try {
    await $fetch('/api/applications', {
      method: 'POST',
      body: { candidateId, jobId: props.jobId },
    })
    emit('created')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    applyError.value = err.data?.statusMessage ?? 'Failed to apply candidate'
  } finally {
    isApplying.value = false
  }
}
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="ui-modal-panel relative w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="ui-panel-header flex items-center justify-between px-5 py-4">
          <div class="flex items-center gap-2">
            <UserPlus class="ui-icon-brand size-5" />
            <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Add Candidate</h3>
          </div>
          <button
            class="ui-button ui-button-ghost p-1"
            @click="emit('close')"
          >
            <X class="size-5" />
          </button>
        </div>

        <!-- Search -->
        <div class="px-5 pt-4">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
            <input
              v-model="searchInput"
              type="text"
              placeholder="Search candidates by name or email…"
              class="ui-field pl-10"
            />
          </div>
        </div>

        <!-- Error -->
        <div v-if="applyError" class="ui-alert ui-alert-danger mx-5 mt-3">
          {{ applyError }}
        </div>

        <!-- Candidate list -->
        <div class="flex-1 overflow-y-auto px-5 py-3">
          <div v-if="searchStatus === 'pending'" class="text-center py-6 text-surface-400 text-sm">
            Searching…
          </div>

          <div v-else-if="candidates.length === 0" class="text-center py-6 text-surface-400 text-sm">
            {{ debouncedSearch ? 'No candidates found.' : 'No candidates in your org yet.' }}
          </div>

          <div v-else class="space-y-1">
            <button
              v-for="c in candidates"
              :key="c.id"
              :disabled="isApplying"
              class="ui-list-row w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left disabled:opacity-50"
              @click="applyCandidate(c.id)"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                  {{ formatCandidateName(c) }}
                </p>
                <p class="text-xs text-surface-400 truncate">{{ c.email }}</p>
              </div>
              <span class="ui-inline-link-brand text-xs font-medium shrink-0 ml-2">
                Apply
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
