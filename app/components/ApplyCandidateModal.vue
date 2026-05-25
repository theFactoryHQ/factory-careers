<script setup lang="ts">
import { X, UserPlus } from 'lucide-vue-next'
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
const toast = useToast()

// Apply candidate
const isApplying = ref(false)

async function applyCandidate(candidateId: string) {
  isApplying.value = true
  try {
    await $fetch('/api/applications', {
      method: 'POST',
      body: { candidateId, jobId: props.jobId },
    })
    emit('created')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to apply candidate', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isApplying.value = false
  }
}
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/72 backdrop-blur-sm" @click="emit('close')" />
      <div class="relative mx-4 flex max-h-[80vh] w-full max-w-md flex-col border border-white/10 bg-[#050505] text-white shadow-2xl shadow-black/60">
        <div class="h-1 bg-brand-500" />

        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center border border-brand-500/40 bg-brand-500/10 text-brand-500">
              <UserPlus class="size-4" />
            </div>
            <h3 class="text-lg font-light tracking-normal text-white">Add Candidate</h3>
          </div>
          <button
            type="button"
            class="ui-panel-close-button flex size-8 cursor-pointer items-center justify-center transition-colors"
            aria-label="Close"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Search -->
        <div class="px-5 pt-4">
          <GooeySearchInput
            v-model="searchInput"
            aria-label="Search candidates"
            class="w-full"
            placeholder="Search candidates by name or email…"
            reserve-expanded-space
            tone="inverse"
          />
        </div>

        <!-- Candidate list -->
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div v-if="searchStatus === 'pending'" class="border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-white/45">
            Searching…
          </div>

          <div v-else-if="candidates.length === 0" class="border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-white/45">
            {{ debouncedSearch ? 'No candidates found.' : 'No candidates in your org yet.' }}
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="c in candidates"
              :key="c.id"
              :disabled="isApplying"
              class="flex w-full cursor-pointer items-center justify-between border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-brand-500/55 hover:bg-brand-500/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              @click="applyCandidate(c.id)"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-white">
                  {{ formatCandidateName(c) }}
                </p>
                <p class="mt-1 truncate text-xs text-white/45">{{ c.email }}</p>
              </div>
              <span class="ml-3 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
                Apply
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
