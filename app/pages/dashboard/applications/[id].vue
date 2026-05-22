<script setup lang="ts">
import { ArrowLeft, User, Briefcase, Calendar, Clock, Hash, FileText, MessageSquare } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const applicationId = route.params.id as string
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

const { application, status: fetchStatus, error, refresh, updateApplication } = useApplication(applicationId)

const { formatCandidateName } = useOrgSettings()

useSeoMeta({
  title: computed(() =>
    application.value
      ? `${application.value.candidate.firstName} ${application.value.candidate.lastName} → ${application.value.job.title} — Factory Careers`
      : 'Application — Factory Careers',
  ),
})

// ─────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

const allowedTransitions = computed(() => {
  if (!application.value) return []
  return APPLICATION_STATUS_TRANSITIONS[application.value.status] ?? []
})

const isTransitioning = ref(false)
const showInterviewSidebar = ref(false)

async function handleTransition(newStatus: string) {
  isTransitioning.value = true
  try {
    await updateApplication({ status: newStatus as any })
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isTransitioning.value = false
  }
}

// ─────────────────────────────────────────────
// Notes editing
// ─────────────────────────────────────────────

const isEditingNotes = ref(false)
const notesInput = ref('')
const isSavingNotes = ref(false)

function startEditNotes() {
  notesInput.value = application.value?.notes ?? ''
  isEditingNotes.value = true
}

async function saveNotes() {
  isSavingNotes.value = true
  try {
    await updateApplication({ notes: notesInput.value || null })
    isEditingNotes.value = false
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSavingNotes.value = false
  }
}

function formatResponseValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '—')
}
</script>

<template>
  <div class="ui-detail-page">
    <!-- Back link -->
    <NuxtLink
      :to="$localePath('/dashboard/applications')"
      class="ui-button ui-button-secondary ui-detail-back-link"
    >
      <ArrowLeft class="size-4" />
      Back to Applications
    </NuxtLink>

    <!-- Loading -->
    <div v-if="fetchStatus === 'pending'" class="ui-detail-loading-state text-surface-400">
      Loading application…
    </div>

    <!-- Error / not found -->
    <div
      v-else-if="error"
      class="ui-alert ui-alert-danger ui-detail-card"
    >
      {{ error.statusCode === 404 ? 'Application not found.' : 'Failed to load application.' }}
      <NuxtLink :to="$localePath('/dashboard/applications')" class="ui-inline-link-brand ml-1 underline">Back to Applications</NuxtLink>
    </div>

    <!-- Application detail -->
    <template v-else-if="application">
      <!-- Header -->
      <div class="ui-panel ui-detail-header-card">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">
          Application Overview
        </p>
        <div class="mb-2 flex flex-wrap items-center gap-2 text-surface-400">
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50 truncate">
            {{ formatCandidateName(application.candidate) }}
          </h1>
          <span class="text-surface-400">→</span>
          <NuxtLink
            :to="$localePath(`/dashboard/jobs/${application.job.id}`)"
            class="ui-inline-link ui-inline-link-brand text-xl truncate"
          >
            {{ application.job.title }}
          </NuxtLink>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <span
            class="ui-pill"
            :class="getApplicationStatusBadgeClass(application.status, 'soft')"
          >
            {{ getApplicationStatusLabel(application.status) }}
          </span>
          <TimelineDateLink :date="application.createdAt" class="text-sm text-surface-500 dark:text-surface-400">
            Applied {{ new Date(application.createdAt).toLocaleDateString() }}
          </TimelineDateLink>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="ui-panel ui-detail-action-strip">
        <div class="flex flex-wrap items-center gap-2">
          <span class="ui-pill">Quick actions</span>
          <button
            v-for="nextStatus in allowedTransitions"
            :key="nextStatus"
            :disabled="isTransitioning"
            class="ui-button rounded-full px-3.5 py-1.5 text-sm"
            :class="getApplicationTransitionButtonClass(nextStatus, 'solid')"
            @click="handleTransition(nextStatus)"
          >
            <span
              class="ui-status-dot mr-2"
              :class="getApplicationTransitionDotClass(nextStatus)"
            />
            {{ getApplicationTransitionLabel(nextStatus) }}
          </button>
          <button
            class="ui-button ui-button-secondary rounded-full px-3.5 py-1.5 text-sm"
            @click="showInterviewSidebar = true"
          >
            <Calendar class="size-3.5" />
            Schedule Interview
          </button>
        </div>
      </div>

      <div class="ui-detail-card-grid">
        <!-- Candidate info -->
        <div class="ui-panel ui-detail-card">
          <div class="ui-detail-card-header">
            <User class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Candidate</h2>
          </div>
          <dl class="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Name</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <NuxtLink
                  :to="$localePath(`/dashboard/candidates/${application.candidate.id}`)"
                  class="ui-inline-link ui-inline-link-brand"
                >
                  {{ formatCandidateName(application.candidate) }}
                </NuxtLink>
              </dd>
            </div>
            <div>
              <dt class="text-surface-400">Email</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <a
                  :href="`mailto:${application.candidate.email}`"
                  target="_blank"
                  class="ui-inline-link ui-inline-link-brand cursor-pointer"
                >{{ application.candidate.email }}</a>
              </dd>
            </div>
            <div v-if="application.candidate.phone">
              <dt class="text-surface-400">Phone</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">{{ application.candidate.phone }}</dd>
            </div>
          </dl>
        </div>

        <!-- Job info -->
        <div class="ui-panel ui-detail-card">
          <div class="ui-detail-card-header">
            <Briefcase class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Job</h2>
          </div>
          <dl class="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Title</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <NuxtLink
                  :to="$localePath(`/dashboard/jobs/${application.job.id}`)"
                  class="ui-inline-link ui-inline-link-brand"
                >
                  {{ application.job.title }}
                </NuxtLink>
              </dd>
            </div>
            <div>
              <dt class="text-surface-400">Job Status</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium capitalize">{{ application.job.status }}</dd>
            </div>
          </dl>
        </div>

        <!-- Application details -->
        <div class="ui-panel ui-detail-card md:col-span-2">
          <div class="ui-detail-card-header">
            <Hash class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Details</h2>
          </div>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt class="text-surface-400">Score</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">{{ application.score ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-surface-400">Status</dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium capitalize">{{ application.status }}</dd>
            </div>
            <div>
              <dt class="text-surface-400 inline-flex items-center gap-1">
                <Calendar class="size-3.5" />
                Applied
              </dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <TimelineDateLink :date="application.createdAt">{{ new Date(application.createdAt).toLocaleDateString() }}</TimelineDateLink>
              </dd>
            </div>
            <div>
              <dt class="text-surface-400 inline-flex items-center gap-1">
                <Clock class="size-3.5" />
                Updated
              </dt>
              <dd class="text-surface-700 dark:text-surface-200 font-medium">
                <TimelineDateLink :date="application.updatedAt">{{ new Date(application.updatedAt).toLocaleDateString() }}</TimelineDateLink>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Notes -->
      <div class="ui-panel ui-detail-card-spaced">
        <div class="ui-detail-card-header justify-between">
          <div class="flex items-center gap-2">
            <MessageSquare class="size-4 text-surface-500 dark:text-surface-400" />
            <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Notes</h2>
          </div>
          <button
            v-if="!isEditingNotes"
            class="ui-inline-link ui-inline-link-brand cursor-pointer text-xs font-medium"
            @click="startEditNotes"
          >
            {{ application.notes ? 'Edit' : 'Add Notes' }}
          </button>
        </div>

        <div v-if="isEditingNotes">
          <textarea
            v-model="notesInput"
            rows="4"
            placeholder="Add notes about this application…"
            class="ui-field"
          />
          <div class="flex items-center gap-2 mt-2">
            <button
              :disabled="isSavingNotes"
              class="ui-button ui-button-primary px-3 py-1.5 text-sm"
              @click="saveNotes"
            >
              {{ isSavingNotes ? 'Saving…' : 'Save' }}
            </button>
            <button
              class="ui-button ui-button-secondary px-3 py-1.5 text-sm"
              @click="isEditingNotes = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <p
          v-else-if="application.notes"
          class="text-sm text-surface-600 dark:text-surface-300 whitespace-pre-wrap"
        >
          {{ application.notes }}
        </p>
        <p v-else class="text-sm text-surface-400 italic">No notes yet.</p>
      </div>

      <!-- Custom properties (Notion-style) -->
      <div class="ui-panel ui-detail-card-compact mb-4">
        <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-2 px-2">Properties</h2>
        <PropertyBlock
          entity-type="application"
          :entity-id="applicationId"
          :job-id="application.job.id"
          :entries="(application.properties ?? []) as import('~~/shared/properties').PropertyEntry[]"
          @refresh="refresh()"
        />
      </div>

      <!-- Question Responses -->
      <div
        v-if="application.responses && application.responses.length > 0"
        class="ui-panel ui-detail-card"
      >
        <div class="ui-detail-card-header">
          <FileText class="size-4 text-surface-500 dark:text-surface-400" />
          <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-200">
            Application Responses ({{ application.responses.length }})
          </h2>
        </div>
        <div class="space-y-3">
          <div
            v-for="response in application.responses"
            :key="response.id"
            class="ui-panel-divider pb-3 last:border-0 last:pb-0"
          >
            <dt class="text-xs font-medium text-surface-500 dark:text-surface-400 mb-0.5">
              {{ response.question?.label ?? 'Unknown question' }}
            </dt>
            <dd class="text-sm text-surface-700 dark:text-surface-200">
              {{ formatResponseValue(response.value) }}
            </dd>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Interview Schedule Sidebar -->
  <InterviewScheduleSidebar
    v-if="showInterviewSidebar && application"
    :application-id="applicationId"
    :candidate-name="`${application.candidate.firstName} ${application.candidate.lastName}`"
    :job-title="application.job.title"
    @close="showInterviewSidebar = false"
    @scheduled="showInterviewSidebar = false"
  />
</template>
