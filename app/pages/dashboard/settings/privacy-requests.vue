<script setup lang="ts">
import { Check, FileCheck2, Loader2, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Privacy Requests - Factory Careers',
  description: 'Review and fulfill applicant privacy deletion requests.',
})

type PrivacyRequestRow = {
  id: string
  status: 'submitted' | 'verified' | 'in_review' | 'completed' | 'denied' | 'cancelled'
  requesterName: string
  requesterEmail: string
  stateOfResidence: string
  jobSlug: string | null
  applicationId: string | null
  details: string | null
  verifiedAt: string | Date | null
  completedAt: string | Date | null
  createdAt: string | Date
  resolutionNotes: string | null
  denialReason: string | null
}

type CandidateMatch = {
  id: string
  firstName: string
  lastName: string
  email: string
  createdAt: string | Date
}

const { allowed: canReadPrivacyRequests } = usePermission({ privacyRequest: ['read'] })
const { allowed: canUpdatePrivacyRequests } = usePermission({ privacyRequest: ['update'] })

const selectedRequestId = ref<string | null>(null)
const selectedCandidateIds = ref<string[]>([])
const resolutionNotes = ref('')
const denialReason = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const isActing = ref(false)

const { data, pending, error, refresh } = await useFetch<{ data: PrivacyRequestRow[]; total: number }>('/api/privacy-requests', {
  key: 'settings-privacy-requests',
  default: () => ({ data: [], total: 0 }),
})

const selectedRequest = computed(() => data.value.data.find((request) => request.id === selectedRequestId.value) ?? data.value.data[0] ?? null)
const detail = ref<{ request: PrivacyRequestRow | null; matches: CandidateMatch[] }>({ request: null, matches: [] })

watch(selectedRequest, (request) => {
  selectedRequestId.value = request?.id ?? null
  selectedCandidateIds.value = []
  resolutionNotes.value = request?.resolutionNotes ?? ''
  denialReason.value = request?.denialReason ?? ''
  void fetchDetail()
}, { immediate: true })

const matches = computed(() => detail.value?.matches ?? [])
const canFulfill = computed(() =>
  canUpdatePrivacyRequests.value
  && !!selectedRequest.value?.verifiedAt
  && selectedRequest.value.status !== 'completed'
  && selectedCandidateIds.value.length > 0,
)

function formatDate(value: string | Date | null | undefined) {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusLabel(status: PrivacyRequestRow['status']) {
  return status.replace('_', ' ')
}

function toggleCandidate(id: string, checked: boolean) {
  selectedCandidateIds.value = checked
    ? Array.from(new Set([...selectedCandidateIds.value, id]))
    : selectedCandidateIds.value.filter((candidateId) => candidateId !== id)
}

async function fetchDetail() {
  if (!selectedRequest.value) {
    detail.value = { request: null, matches: [] }
    return
  }

  detail.value = await $fetch<{ request: PrivacyRequestRow; matches: CandidateMatch[] }>(
    `/api/privacy-requests/${selectedRequest.value.id}`,
  )
}

async function markInReview() {
  if (!selectedRequest.value) return
  await updateRequest({ status: 'in_review', resolutionNotes: resolutionNotes.value })
}

async function denyRequest() {
  if (!selectedRequest.value) return
  await updateRequest({ status: 'denied', denialReason: denialReason.value, resolutionNotes: resolutionNotes.value })
}

async function updateRequest(body: Record<string, unknown>) {
  if (!selectedRequest.value) return
  isActing.value = true
  actionError.value = ''
  actionSuccess.value = ''
  try {
    await $fetch(`/api/privacy-requests/${selectedRequest.value.id}`, { method: 'PATCH' as any, body })
    actionSuccess.value = 'Privacy request updated.'
    await refresh()
    await fetchDetail()
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage ?? 'Failed to update privacy request.'
  } finally {
    isActing.value = false
  }
}

async function fulfillRequest() {
  if (!selectedRequest.value || !canFulfill.value) return
  isActing.value = true
  actionError.value = ''
  actionSuccess.value = ''
  try {
    await $fetch(`/api/privacy-requests/${selectedRequest.value.id}/fulfill`, {
      method: 'POST' as any,
      body: {
        candidateIds: selectedCandidateIds.value,
        resolutionNotes: resolutionNotes.value,
      },
    })
    actionSuccess.value = 'Deletion request fulfilled.'
    selectedCandidateIds.value = []
    await refresh()
    await fetchDetail()
  } catch (err: any) {
    actionError.value = err?.data?.statusMessage ?? 'Failed to fulfill privacy request.'
  } finally {
    isActing.value = false
  }
}
</script>

<template>
  <div class="ui-settings-page">
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Privacy Requests</h1>
      <p class="mt-0.5 text-sm text-surface-500 dark:text-surface-400">
        Review verified deletion requests and fulfill them through audited staff actions.
      </p>
    </div>

    <section v-if="!canReadPrivacyRequests" class="ui-panel ui-settings-panel p-6">
      <div class="flex items-start gap-3">
        <ShieldCheck class="size-5 shrink-0 text-surface-400" />
        <p class="text-sm text-surface-600 dark:text-surface-300">You do not have access to privacy request reviews.</p>
      </div>
    </section>

    <section v-else class="grid gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <div class="ui-panel ui-settings-panel">
        <div class="ui-panel-header ui-settings-panel-header flex items-center justify-between">
          <div class="flex items-center gap-3">
            <FileCheck2 class="size-5 text-brand-400" />
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Requests</h2>
          </div>
          <button class="ui-button ui-button-ghost" type="button" @click="refresh()">
            <RefreshCw class="size-4" />
          </button>
        </div>
        <div class="divide-y divide-surface-200 dark:divide-surface-800">
          <div v-if="pending" class="p-5 text-sm text-surface-500">Loading privacy requests...</div>
          <div v-else-if="error" class="p-5 text-sm text-danger-500">Failed to load privacy requests.</div>
          <button
            v-for="request in data.data"
            :key="request.id"
            type="button"
            class="block w-full px-5 py-4 text-left transition-colors hover:bg-surface-50 dark:hover:bg-white/[0.03]"
            :class="selectedRequestId === request.id ? 'bg-brand-50 dark:bg-brand-950/20' : ''"
            @click="selectedRequestId = request.id"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-100">{{ request.requesterName }}</p>
              <span class="shrink-0 text-xs capitalize text-surface-500">{{ statusLabel(request.status) }}</span>
            </div>
            <p class="mt-1 truncate text-xs text-surface-500">{{ request.requesterEmail }}</p>
            <p class="mt-1 text-xs text-surface-400">{{ formatDate(request.createdAt) }}</p>
          </button>
          <div v-if="!pending && data.data.length === 0" class="p-5 text-sm text-surface-500">No privacy requests yet.</div>
        </div>
      </div>

      <div v-if="selectedRequest" class="ui-panel ui-settings-panel">
        <div class="ui-panel-header ui-settings-panel-header">
          <div class="flex items-center gap-3">
            <ShieldCheck class="size-5 text-brand-400" />
            <div>
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ selectedRequest.requesterName }}</h2>
              <p class="text-sm text-surface-500 dark:text-surface-400">{{ selectedRequest.requesterEmail }}</p>
            </div>
          </div>
        </div>

        <div class="ui-settings-panel-body space-y-6">
          <dl class="grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-xs uppercase text-surface-400">Status</dt>
              <dd class="mt-1 text-sm capitalize text-surface-900 dark:text-surface-100">{{ statusLabel(selectedRequest.status) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-surface-400">Verified</dt>
              <dd class="mt-1 text-sm text-surface-900 dark:text-surface-100">{{ formatDate(selectedRequest.verifiedAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-surface-400">State</dt>
              <dd class="mt-1 text-sm text-surface-900 dark:text-surface-100">{{ selectedRequest.stateOfResidence }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-surface-400">Submitted</dt>
              <dd class="mt-1 text-sm text-surface-900 dark:text-surface-100">{{ formatDate(selectedRequest.createdAt) }}</dd>
            </div>
          </dl>

          <div v-if="selectedRequest.details">
            <h3 class="text-sm font-medium text-surface-900 dark:text-surface-100">Requester details</h3>
            <p class="mt-2 whitespace-pre-line text-sm leading-7 text-surface-600 dark:text-surface-300">{{ selectedRequest.details }}</p>
          </div>

          <div>
            <h3 class="text-sm font-medium text-surface-900 dark:text-surface-100">Matched candidates</h3>
            <div class="mt-3 space-y-2">
              <label
                v-for="match in matches"
                :key="match.id"
                class="flex items-center gap-3 border border-surface-200 p-3 text-sm dark:border-surface-800"
              >
                <input
                  type="checkbox"
                  :checked="selectedCandidateIds.includes(match.id)"
                  :disabled="selectedRequest.status === 'completed'"
                  @change="toggleCandidate(match.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-surface-900 dark:text-surface-100">{{ match.firstName }} {{ match.lastName }}</span>
                  <span class="block truncate text-xs text-surface-500">{{ match.email }}</span>
                </span>
              </label>
              <p v-if="matches.length === 0" class="text-sm text-surface-500">No candidates match this verified email in the active organization.</p>
            </div>
          </div>

          <div>
            <label for="resolution-notes" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Resolution notes</label>
            <textarea id="resolution-notes" v-model="resolutionNotes" rows="4" class="ui-field min-h-24 resize-y" />
          </div>

          <div>
            <label for="denial-reason" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Denial reason</label>
            <textarea id="denial-reason" v-model="denialReason" rows="3" class="ui-field min-h-20 resize-y" />
          </div>

          <div v-if="actionError" class="ui-alert ui-alert-danger">{{ actionError }}</div>
          <div v-if="actionSuccess" class="ui-alert ui-alert-success">{{ actionSuccess }}</div>

          <div class="flex flex-wrap items-center gap-2">
            <button class="ui-button ui-button-secondary" type="button" :disabled="isActing || !canUpdatePrivacyRequests" @click="markInReview">
              <Loader2 v-if="isActing" class="size-4 animate-spin" />
              <Check v-else class="size-4" />
              Mark in review
            </button>
            <button class="ui-button ui-button-danger-outline" type="button" :disabled="isActing || !canUpdatePrivacyRequests" @click="denyRequest">
              <XCircle class="size-4" />
              Deny
            </button>
            <button class="ui-button ui-button-danger" type="button" :disabled="isActing || !canFulfill" @click="fulfillRequest">
              <Trash2 class="size-4" />
              Fulfill deletion
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
