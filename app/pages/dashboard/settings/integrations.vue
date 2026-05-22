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
const calendarProviderLabel = computed(() => calendarStatus.value.providerLabel || 'Microsoft Calendar')
const selectedCalendarProvider = computed(() => calendarStatus.value.provider || calendarStatus.value.availableProvider || 'microsoft')
const isMicrosoftCalendar = computed(() => selectedCalendarProvider.value === 'microsoft')
const isAdminManagedCalendar = computed(() => calendarStatus.value.managedByAdmin)
const calendarProviderName = computed(() => isMicrosoftCalendar.value ? 'Microsoft Calendar' : 'Google Calendar')
const calendarSyncLabel = computed(() => isAdminManagedCalendar.value ? 'Mailbox sync' : (isMicrosoftCalendar.value ? 'Event sync' : 'Two-way sync'))
const sharedCalendarEmail = computed(() => calendarStatus.value.expectedAccountEmail || 'interviews@thefactoryhq.com')
const calendarDestinations = computed(() => calendarStatus.value.destinations ?? [])
const destinationTypeLabel = (type: string) => type === 'shared_mailbox' ? 'Shared mailbox' : 'User mailbox'

// Handle OAuth callback query params
const successMessage = ref('')
const errorMessage = ref('')

onMounted(() => {
  const success = route.query.success as string | undefined
  const error = route.query.error as string | undefined

  if (success === 'connected') {
    successMessage.value = `${calendarProviderLabel.value} connected successfully! Your interviews will now sync automatically.`
    refresh()
  }
  else if (error === 'consent_denied') {
    errorMessage.value = 'Calendar connection was cancelled. You can try again anytime.'
  }
  else if (error === 'oauth_failed') {
    errorMessage.value = `Failed to connect ${calendarProviderName.value}. Please try again.`
  }
  else if (error === 'account_mismatch' || error === 'calendar_not_accessible') {
    errorMessage.value = `Could not access ${sharedCalendarEmail.value}. Sign in with a Factory Microsoft account that can access that mailbox.`
  }

  // Clear query params after reading
  if (success || error) {
    const newQuery = { ...route.query }
    delete newQuery.success
    delete newQuery.error
    delete newQuery.provider
    navigateTo({ query: newQuery }, { replace: true })
  }
})

async function handleDisconnect() {
  isDisconnecting.value = true
  try {
    await disconnect()
    showDisconnectConfirm.value = false
    successMessage.value = `${calendarProviderName.value} disconnected.`
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
  <div class="w-full">
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
          class="ui-button ui-button-ghost p-1"
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
          class="ui-button ui-button-ghost p-1"
          @click="errorMessage = ''"
        >
          <X class="size-4" />
        </button>
      </div>
    </Transition>

    <!-- Calendar Integration Card -->
    <div class="ui-panel overflow-hidden">
      <!-- Header -->
      <div class="ui-panel-header flex items-center gap-4 px-4 sm:px-6 py-5">
        <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10">
          <Calendar class="size-5" />
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">
            {{ calendarProviderName }}
          </h2>
          <p class="text-sm text-surface-500 dark:text-surface-400">
            Organization-wide interview calendar
          </p>
        </div>

        <!-- Status Badge -->
        <div
          v-if="isConnected"
          class="ui-pill ui-pill-success rounded-full px-2.5 py-1 text-xs"
        >
          <span class="ui-status-dot ui-status-dot-success animate-pulse" />
          {{ isAdminManagedCalendar ? 'Configured' : 'Connected' }}
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
            Microsoft Calendar integration requires server configuration. A server administrator must set the
            <code class="ui-code">MICROSOFT_CALENDAR_CLIENT_ID</code>
            and
            <code class="ui-code">MICROSOFT_CALENDAR_CLIENT_SECRET</code>
            environment variables before users can connect.
          </p>
          <div class="flex items-center gap-4">
            <a
              href="https://learn.microsoft.com/en-us/graph/outlook-calendar-concept-overview"
              target="_blank"
              rel="noopener noreferrer"
              class="ui-inline-link ui-inline-link-brand inline-flex items-center gap-1.5 text-sm"
            >
              Microsoft Graph Calendar
              <ExternalLink class="size-3.5" />
            </a>
            <a
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noopener noreferrer"
              class="ui-inline-link ui-inline-link-muted inline-flex items-center gap-1.5 text-sm"
            >
              Azure App registrations
              <ExternalLink class="size-3.5" />
            </a>
          </div>
        </div>

        <!-- Connected state -->
        <div v-else-if="isConnected" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <div class="text-xs font-medium text-surface-400 dark:text-surface-500 uppercase tracking-wider">
                Default calendar
              </div>
              <div class="text-sm text-surface-900 dark:text-surface-100">
                {{ sharedCalendarEmail }}
              </div>
            </div>
            <div class="space-y-1">
              <div class="text-xs font-medium text-surface-400 dark:text-surface-500 uppercase tracking-wider">
                {{ isAdminManagedCalendar ? 'Managed by' : 'Connected by' }}
              </div>
              <div class="text-sm text-surface-900 dark:text-surface-100">
                {{ calendarStatus.accountEmail || 'Unknown' }}
              </div>
            </div>
          </div>

          <!-- Sync status -->
          <div class="flex items-center gap-2 text-sm">
            <RefreshCw class="size-3.5 text-surface-400" />
            <span class="text-surface-600 dark:text-surface-400">
              {{ calendarSyncLabel }}:
              <span
                :class="isMicrosoftCalendar || calendarStatus.webhookActive
                  ? 'ui-feedback-success'
                  : 'ui-feedback-warning'"
              >
                {{ isMicrosoftCalendar ? 'Active' : (calendarStatus.webhookActive ? 'Active' : 'Pending setup') }}
              </span>
            </span>
          </div>

          <div v-if="isAdminManagedCalendar" class="ui-panel-muted p-4 space-y-3">
            <div v-if="calendarDestinations.length > 0" class="space-y-2">
              <div
                v-for="destination in calendarDestinations"
                :key="`${destination.type}:${destination.email}`"
                class="flex items-center justify-between gap-3 text-sm"
              >
                <div class="min-w-0">
                  <div class="truncate font-medium text-surface-800 dark:text-surface-200">
                    {{ destination.email }}
                  </div>
                  <div class="text-xs text-surface-500 dark:text-surface-400">
                    {{ destinationTypeLabel(destination.type) }}
                  </div>
                </div>
                <span
                  v-if="destination.isPrimary"
                  class="ui-pill ui-pill-brand shrink-0 rounded-full px-2 py-0.5 text-xs"
                >
                  Primary
                </span>
              </div>
            </div>
            <div
              v-if="calendarStatus.syncInterviewers"
              class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400"
            >
              <Check class="ui-icon-success size-4 shrink-0" />
              Interviewer mailboxes are included automatically
            </div>
          </div>

          <!-- Features list -->
          <div class="ui-panel-muted p-4 space-y-2">
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Check class="ui-icon-success size-4 shrink-0" />
              Interviews automatically appear on configured mailbox calendars
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Check class="ui-icon-success size-4 shrink-0" />
              Candidates receive calendar invites as attendees
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Check class="ui-icon-success size-4 shrink-0" />
              Events are created on {{ sharedCalendarEmail }}
            </div>
            <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
              <Clock class="ui-icon-success size-4 shrink-0" />
              Timezone-aware scheduling
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2">
            <div class="flex items-center gap-1.5 text-xs text-surface-400 dark:text-surface-500">
              <Shield class="size-3.5" />
              {{ isAdminManagedCalendar ? 'App credentials managed by server configuration' : 'Tokens encrypted at rest' }}
            </div>

            <div v-if="!isAdminManagedCalendar" class="flex items-center gap-2">
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
              Connect with a Factory Microsoft account that can access {{ sharedCalendarEmail }}.
              Interview schedules will sync to that shared interview mailbox calendar.
              Candidates will see the event in their calendars, with
              attendee notifications handled by the calendar provider.
            </p>

            <!-- Features preview -->
            <div class="ui-panel-muted p-4 space-y-2">
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <Calendar class="ui-icon-brand size-4 shrink-0" />
                Auto-create events on the Factory shared calendar
              </div>
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <RefreshCw class="ui-icon-brand size-4 shrink-0" />
                Interview event creation, updates, and cancellation sync
              </div>
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <Clock class="ui-icon-brand size-4 shrink-0" />
                Proper timezone handling — no more scheduling confusion
              </div>
              <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <Shield class="ui-icon-brand size-4 shrink-0" />
                OAuth tokens encrypted at rest — revoke anytime
              </div>
            </div>
          </div>

          <button
            class="ui-button ui-button-primary py-2.5"
            @click="connect"
          >
            <Calendar class="size-4" />
            Connect shared calendar
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
