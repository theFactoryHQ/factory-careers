<script setup lang="ts">
import {
  getCandidateResponseActionLabel,
  getCandidateResponseButtonClass,
  getCandidateResponseIconClass,
  getCandidateResponseLabel,
  getCandidateResponseSymbol,
} from '~/utils/status-display'

definePageMeta({
  layout: 'public',
})

const route = useRoute()
const token = computed(() => {
  const t = route.query.token
  return typeof t === 'string' ? t : ''
})

const { data, error: fetchError, status: fetchStatus } = await useFetch('/api/public/interviews/respond', {
  query: { token },
  immediate: !!token.value,
})

const interviewTypeLabels: Record<string, string> = {
  video: 'Video Call',
  phone: 'Phone Call',
  in_person: 'In Person',
  technical: 'Technical Interview',
  panel: 'Panel Interview',
  take_home: 'Take-Home Assignment',
}

const confirming = ref(false)
const confirmed = ref(false)
const confirmError = ref('')

async function confirmResponse() {
  if (!token.value) return
  confirming.value = true
  confirmError.value = ''

  try {
    await $fetch('/api/public/interviews/respond', {
      method: 'POST',
      body: { token: token.value },
    })
    confirmed.value = true
  }
  catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    confirmError.value = message || 'Something went wrong. Please try again.'
  }
  finally {
    confirming.value = false
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

useHead({
  title: 'Interview Response',
})
</script>

<template>
  <div class="max-w-lg mx-auto py-12">
    <!-- No token -->
    <div v-if="!token" class="text-center">
      <div class="ui-icon-state ui-icon-state-danger mx-auto mb-4 size-16">
        <span class="text-2xl">⚠</span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
        Invalid Link
      </h1>
      <p class="text-surface-500">
        This link is missing required information. Please use the link from your invitation email.
      </p>
    </div>

    <!-- Loading -->
    <div v-else-if="fetchStatus === 'pending'" class="text-center py-12">
      <div class="animate-spin inline-block w-8 h-8 border-2 border-surface-300 border-t-blue-600 rounded-full mb-4" />
      <p class="text-surface-500">
        Loading interview details...
      </p>
    </div>

    <!-- Error fetching -->
    <div v-else-if="fetchError" class="text-center">
      <div class="ui-icon-state ui-icon-state-danger mx-auto mb-4 size-16">
        <span class="text-2xl">⚠</span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
        {{ fetchError.statusCode === 400 ? 'Link Expired' : 'Something went wrong' }}
      </h1>
      <p class="text-surface-500">
        {{ fetchError.statusCode === 400
          ? 'This response link has expired or is no longer valid. Please contact the hiring team for a new invitation.'
          : 'We couldn\'t load the interview details. Please try again later.'
        }}
      </p>
    </div>

    <!-- Confirmed successfully -->
    <div v-else-if="confirmed" class="text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
           :class="getCandidateResponseIconClass(data?.action ?? '')">
        <span class="text-2xl">
          {{ getCandidateResponseSymbol(data?.action ?? '') }}
        </span>
      </div>
      <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
        Response Recorded
      </h1>
      <p class="text-surface-500 mb-6">
        <template v-if="data?.action === 'accepted'">
          You've accepted the interview. It should appear in your calendar if you accepted the calendar invite from the email.
        </template>
        <template v-else-if="data?.action === 'declined'">
          You've declined the interview. The hiring team has been notified.
        </template>
        <template v-else>
          You've marked this as tentative. The hiring team has been notified.
        </template>
      </p>
    </div>

    <!-- Interview details + confirm action -->
    <div v-else-if="data">
      <!-- Already responded -->
      <div v-if="data.interview.candidateResponse !== 'pending'" class="text-center">
        <div class="ui-icon-state ui-icon-state-info mx-auto mb-4 size-16">
          <span class="text-2xl">ℹ</span>
        </div>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
          Already Responded
        </h1>
        <p class="text-surface-500">
          You previously {{ getCandidateResponseLabel(data.interview.candidateResponse).toLowerCase() }} this interview.
          If you need to change your response, please contact the hiring team directly.
        </p>
      </div>

      <!-- Interview is no longer scheduled -->
      <div v-else-if="data.interview.status !== 'scheduled'" class="text-center">
        <div class="ui-icon-state mx-auto mb-4 size-16">
          <span class="text-2xl">ℹ</span>
        </div>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
          Interview {{ data.interview.status === 'cancelled' ? 'Cancelled' : data.interview.status === 'completed' ? 'Completed' : 'No Longer Available' }}
        </h1>
        <p class="text-surface-500">
          This interview is no longer accepting responses. Please contact the hiring team if you have questions.
        </p>
      </div>

      <!-- Ready to respond -->
      <div v-else>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-6 text-center">
          Interview Invitation
        </h1>

        <!-- Interview details card -->
        <div class="ui-panel p-6 mb-6">
          <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
            {{ data.interview.title }}
          </h2>

          <dl class="space-y-3 text-sm">
            <div v-if="data.organizationName" class="flex justify-between">
              <dt class="text-surface-500">
                Organization
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium">
                {{ data.organizationName }}
              </dd>
            </div>
            <div v-if="data.jobTitle" class="flex justify-between">
              <dt class="text-surface-500">
                Position
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium">
                {{ data.jobTitle }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-500">
                Date
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium">
                {{ formatDate(data.interview.scheduledAt) }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-500">
                Time
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium">
                {{ formatTime(data.interview.scheduledAt) }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-500">
                Duration
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium">
                {{ data.interview.duration }} minutes
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-500">
                Type
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium">
                {{ interviewTypeLabels[data.interview.type] ?? data.interview.type }}
              </dd>
            </div>
            <div v-if="data.interview.location" class="flex justify-between">
              <dt class="text-surface-500">
                Location
              </dt>
              <dd class="text-surface-900 dark:text-surface-100 font-medium break-all">
                {{ data.interview.location }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Confirm action -->
        <div class="text-center">
          <p class="text-sm text-surface-500 mb-4">
            You are about to <strong>{{ getCandidateResponseActionLabel(data.action).toLowerCase() }}</strong> this interview.
          </p>

          <div v-if="confirmError" class="ui-alert ui-alert-danger mb-4">
            {{ confirmError }}
          </div>

          <button
            :disabled="confirming"
            :class="getCandidateResponseButtonClass(data.action)"
            class="ui-button w-full py-3 px-6 text-white font-semibold"
            @click="confirmResponse"
          >
            <span v-if="confirming">Processing...</span>
            <span v-else>{{ getCandidateResponseActionLabel(data.action) }} Interview</span>
          </button>

          <p class="text-xs text-surface-400 mt-4">
            Clicking this button will record your response and notify the hiring team.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
