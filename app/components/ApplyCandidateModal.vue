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
    <div
      class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
      @click.self="emit('close')"
    >
      <div class="ui-modal-panel ui-modal-frame ui-modal-frame-md">
        <!-- Header -->
        <div class="ui-panel-header ui-modal-header">
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
        <div class="ui-modal-search">
          <div class="relative">
            <Search class="ui-field-icon absolute left-3 top-1/2 -translate-y-1/2 size-4" />
            <input
              v-model="searchInput"
              type="text"
              placeholder="Search candidates by name or email…"
              class="ui-field pl-10"
            />
          </div>
        </div>

        <!-- Error -->
        <div v-if="applyError" class="ui-alert ui-alert-danger ui-modal-alert">
          {{ applyError }}
        </div>

        <!-- Candidate list -->
        <div class="ui-modal-body">
          <div v-if="searchStatus === 'pending'" class="ui-empty-state py-6 text-sm">
            Searching…
          </div>

          <div v-else-if="candidates.length === 0" class="ui-empty-state py-6 text-sm">
            {{ debouncedSearch ? 'No candidates found.' : 'No candidates in your org yet.' }}
          </div>

          <div v-else class="space-y-1">
            <button
              v-for="c in candidates"
              :key="c.id"
              :disabled="isApplying"
              class="ui-list-row ui-modal-list-row disabled:opacity-50"
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
