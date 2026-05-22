<script setup lang="ts">
import {
  Calendar, Check, X, AlertTriangle, ExternalLink, Loader2,
  RefreshCw, Unplug, Shield, Clock,
} from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Integrations — Factory Careers',
  description: 'Connect your calendar and other services',
})

const route = useRoute()
const { calendarStatus, isConnected, isAvailable, connect, disconnect, refresh, status } = useCalendarIntegration()

const isDisconnecting = ref(false)
const showDisconnectConfirm = ref(false)

// Handle OAuth callback query params
const successMessage = ref('')
const errorMessage = ref('')

onMounted(() => {
  const success = route.query.success as string | undefined
  const error = route.query.error as string | undefined

  if (success === 'connected') {
    successMessage.value = 'Google Calendar connected successfully! Your interviews will now sync automatically.'
    refresh()
  }
  else if (error === 'consent_denied') {
    errorMessage.value = 'Calendar connection was cancelled. You can try again anytime.'
  }
  else if (error === 'oauth_failed') {
    errorMessage.value = 'Failed to connect Google Calendar. Please try again.'
  }

  // Clear query params after reading
  if (success || error) {
    const newQuery = { ...route.query }
    delete newQuery.success
    delete newQuery.error
    navigateTo({ query: newQuery }, { replace: true })
  }
})

async function handleDisconnect() {
  isDisconnecting.value = true
  try {
    await disconnect()
    showDisconnectConfirm.value = false
    successMessage.value = 'Google Calendar disconnected.'
  }
  catch {
    errorMessage.value = 'Failed to disconnect. Please try again.'
  }
  finally {
    isDisconnecting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div class="mb-6">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-100">
        Integrations
      </h1>
      <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
        Connect external services to enhance your recruiting workflow.
      </p>
    </div>

    <!-- Success/Error Messages -->
    <Transition name="fade">
      <div
        v-if="successMessage"
        class="ui-alert ui-alert-success mb-4 flex items-center gap-3"
      >
        <Check class="size-4 shrink-0" />
        <p class="flex-1">
          {{ successMessage }}
        </p>
        <button
          class="text-success-400 hover:text-success-600 dark:hover:text-success-200"
          @click="successMessage = ''"
        >
          <X class="size-4" />
        </button>
      </div>
    </Transition>

    <Transition name="fade">
      <div
        v-if="errorMessage"
        class="ui-alert ui-alert-danger mb-4 flex items-center gap-3"
      >
        <AlertTriangle class="size-4 shrink-0" />
        <p class="flex-1">
          {{ errorMessage }}
        </p>
        <button
          class="text-danger-400 hover:text-danger-600 dark:hover:text-danger-200"
          @click="errorMessage = ''"
        >
          <X class="size-4" />
        </button>
      </div>
    </Transition>

    <!-- Google Calendar Integration Card -->
    <div class="ui-panel overflow-hidden">
      <!-- Header -->
      <div class="ui-panel-header flex items-center gap-4 px-4 sm:px-6 py-5">
        <div class="ui-icon-state ui-icon-state-brand flex items-center justify-center size-10 rounded-lg">
          <Calendar class="size-5" />
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">
            Google Calendar
          </h2>
          <p class="text-sm text-surface-500 dark:text-surface-400">
            Two-way sync for interview scheduling
          </p>
        </div>

        <!-- Status Badge -->
        <div
          v-if="isConnected"
          class="ui-pill ui-pill-success rounded-full px-2.5 py-1 text-xs"
        >
          <span class="ui-status-dot ui-status-dot-success animate-pulse" />
          Connected
        </div>
        <div
          v-else-if="!isAvailable"
          class="ui-pill rounded-full px-2.5 py-1 text-xs"
        >
          Not configured
        </div>
      </div>

      <!-- Body -->
      <div class="px-4 sm:px-6 py-5">
        <!-- Loading state -->
        <div v-if="status === 'pending'" class="flex items-center justify-center py-4">
          <Loader2 class="size-5 text-surface-400 animate-spin" />
        </div>

        <!-- Not configured (admin needs to set env vars) -->
        <div v-else-if="!isAvailable" class="space-y-3">
          <p class="text-sm text-surface-600 dark:text-surface-400">
            Google Calendar integration requires server configuration. A server administrator must set the
            <code class="ui-code">GOOGLE_CLIENT_ID</code>
            and
            <code class="ui-code">GOOGLE_CLIENT_SECRET</code>
            environment variables before users can connect.
          </p>
          <div class="flex items-center gap-4">
            <a
              :href="`${useRuntimeConfig().public.marketingUrl}/docs/features/google-calendar`"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              Setup guide
              <ExternalLink class="size-3.5" />
            </a>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400 hover:underline"
            >
              Google Cloud Console
              <ExternalLink class="size-3.5" />
            </a>
          </div>
        </div>

        <!-- Connected state -->
        <div v-else-if="isConnected" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <div class="text-xs font-medium text-surface-400 dark:text-surface-500 uppercase tracking-wider">
                Account
              </div>
              <div class="text-sm text-surface-900 dark:text-surface-100">
                {{ calendarStatus.accountEmail || 'Unknown' }}
              </div>
            </div>
            <div class="space-y-1">
              <div class="text-xs font-medium text-surface-400 dark:text-surface-500 uppercase tracking-wider">
                Calendar
              </div>
              <div class="text-sm text-surface-900 dark:text-surface-100">
                {{ calendarStatus.calendarId === 'primary' ? 'Primary calendar' : calendarStatus.calendarId }}
              </div>
            </div>
          </div>

          <!-- Sync status -->
          <div class="flex items-center gap-2 text-sm">
            <RefreshCw class="size-3.5 text-surface-400" />
            <span class="text-surface-600 dark:text-surface-400">
              Two-way sync:
              <span
                :class="calendarStatus.webhookActive
                  ? 'text-success-600 dark:text-success-400 font-medium'
                  : 'text-warning-600 dark:text-warning-400'"
              >
                {{ calendarStatus.webhookActive ? 'Active' : 'Pending setup' }}
              </span>
            </span>
          </div>

          <!-- Features list -->
          <div class="ui-panel-muted p-4 space-y-2">
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Check class="size-4 text-success-500 shrink-0" />
              Interviews automatically appear in your Google Calendar
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Check class="size-4 text-success-500 shrink-0" />
              Candidates receive calendar invites as attendees
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Check class="size-4 text-success-500 shrink-0" />
              RSVP responses sync back automatically
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Clock class="size-4 text-success-500 shrink-0" />
              Timezone-aware scheduling
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2">
            <div class="flex items-center gap-1.5 text-xs text-surface-400 dark:text-surface-500">
              <Shield class="size-3.5" />
              Tokens encrypted at rest
            </div>

            <div class="flex items-center gap-2">
              <button
                v-if="!showDisconnectConfirm"
                class="ui-button ui-button-danger-outline px-3 py-1.5"
                @click="showDisconnectConfirm = true"
              >
                <Unplug class="size-3.5" />
                Disconnect
              </button>

              <template v-else>
                <span class="text-sm text-surface-500 dark:text-surface-400">Are you sure?</span>
                <button
                  :disabled="isDisconnecting"
                  class="ui-button ui-button-danger px-3 py-1.5 disabled:opacity-50"
                  @click="handleDisconnect"
                >
                  <Loader2 v-if="isDisconnecting" class="size-3.5 animate-spin" />
                  Yes, disconnect
                </button>
                <button
                  class="ui-button ui-button-secondary px-3 py-1.5"
                  @click="showDisconnectConfirm = false"
                >
                  Cancel
                </button>
              </template>
            </div>
          </div>
        </div>

        <!-- Disconnected / Ready to connect -->
        <div v-else class="space-y-4">
          <div class="space-y-3">
            <p class="text-sm text-surface-600 dark:text-surface-400">
              Connect your Google Calendar to automatically sync interview schedules.
              Both you and the candidate will see the event in your calendars, with
              two-way RSVP tracking.
            </p>

            <!-- Features preview -->
            <div class="ui-panel-muted p-4 space-y-2">
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <Calendar class="size-4 text-brand-500 shrink-0" />
                Auto-create calendar events for scheduled interviews
              </div>
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <RefreshCw class="size-4 text-brand-500 shrink-0" />
                Two-way sync — changes in either system stay in sync
              </div>
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <Clock class="size-4 text-brand-500 shrink-0" />
                Proper timezone handling — no more scheduling confusion
              </div>
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <Shield class="size-4 text-brand-500 shrink-0" />
                OAuth tokens encrypted at rest — revoke anytime
              </div>
            </div>
          </div>

          <button
            class="ui-button ui-button-primary py-2.5"
            @click="connect"
          >
            <Calendar class="size-4" />
            Connect Google Calendar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
