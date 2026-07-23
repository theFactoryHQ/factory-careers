<script setup lang="ts">
import { BellRing, Inbox, Loader2, Save, UserRound } from 'lucide-vue-next'
import {
  calculateNextApplicationNotificationDelivery,
  type ApplicationNotificationCadence,
  type ApplicationNotificationPreference,
} from '~~/shared/application-notifications'

definePageMeta({})

useSeoMeta({
  title: 'Notification Settings — Factory Careers',
  description: 'Manage personal and careers inbox application email notifications.',
})

type PreferenceResponse = ApplicationNotificationPreference & {
  nextDeliveryAt: string | null
}

type InboxResponse = PreferenceResponse & {
  recipientEmail: string | null
  usesEnvironmentFallback: boolean
}

const toast = useToast()
const { allowed: canUpdateOrg } = usePermission({ organization: ['update'] })
const cadenceOptions: Array<{ value: ApplicationNotificationCadence, label: string, help: string }> = [
  { value: 'immediate', label: 'Per application', help: 'Send one email as each application arrives.' },
  { value: 'daily', label: 'Daily', help: 'Group applications into one daily summary.' },
  { value: 'weekly', label: 'Weekly', help: 'Group applications into one weekly summary.' },
  { value: 'monthly', label: 'Monthly', help: 'Group applications into one monthly summary.' },
  { value: 'off', label: 'Off', help: 'Do not send application notification emails.' },
]
const weekdayOptions = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]
const timeZoneOptions = Array.from(new Set([
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
])).filter(Boolean)

function createSchedule(cadence: ApplicationNotificationCadence = 'off'): ApplicationNotificationPreference {
  return {
    cadence,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    deliveryTime: '09:00',
    weeklyDay: 1,
    monthlyDay: 1,
  }
}

const personalForm = reactive(createSchedule())
const inboxForm = reactive(createSchedule('weekly'))
const inboxRecipientEmail = ref('')
const inboxUsesFallback = ref(false)
const savingPersonal = ref(false)
const savingInbox = ref(false)

const { data: personal, status: personalStatus, refresh: refreshPersonal } = await useFetch<PreferenceResponse>(
  '/api/notification-preferences/application-email',
  { key: 'application-notification-personal' },
)
const {
  data: inbox,
  status: inboxStatus,
  execute: loadInbox,
} = useFetch<InboxResponse>('/api/notification-settings/application-email', {
  key: 'application-notification-inbox',
  immediate: false,
})

watch(personal, (value) => {
  if (value) Object.assign(personalForm, value)
}, { immediate: true })

watch(inbox, (value) => {
  if (!value) return
  Object.assign(inboxForm, value)
  inboxUsesFallback.value = value.usesEnvironmentFallback
  inboxRecipientEmail.value = value.usesEnvironmentFallback ? '' : (value.recipientEmail ?? '')
}, { immediate: true })

watch(canUpdateOrg, (allowed) => {
  if (allowed && inboxStatus.value === 'idle') void loadInbox()
}, { immediate: true })

function selectedCadenceHelp(cadence: ApplicationNotificationCadence): string {
  return cadenceOptions.find(option => option.value === cadence)?.help ?? ''
}

function nextDeliveryLabel(preference: ApplicationNotificationPreference): string {
  if (preference.cadence === 'off') return 'No email scheduled'
  if (preference.cadence === 'immediate') return 'Each new application'
  try {
    const next = calculateNextApplicationNotificationDelivery(preference)
    if (!next) return 'No email scheduled'
    return new Intl.DateTimeFormat('en-US', {
      timeZone: preference.timeZone,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(next)
  }
  catch {
    return 'Enter a valid IANA timezone'
  }
}

const personalNextDelivery = computed(() => nextDeliveryLabel(personalForm))
const inboxNextDelivery = computed(() => nextDeliveryLabel(inboxForm))

async function savePersonal() {
  savingPersonal.value = true
  try {
    const response = await $fetch<PreferenceResponse>('/api/notification-preferences/application-email', {
      method: 'PUT',
      body: { ...personalForm },
    })
    Object.assign(personalForm, response)
    toast.success('Personal notifications saved')
  }
  catch (error) {
    toast.error('Unable to save personal notifications', {
      message: error instanceof Error ? error.message : undefined,
    })
  }
  finally {
    savingPersonal.value = false
  }
}

async function saveInbox() {
  if (!canUpdateOrg.value) return
  savingInbox.value = true
  try {
    const response = await $fetch<InboxResponse>('/api/notification-settings/application-email', {
      method: 'PATCH',
      body: {
        ...inboxForm,
        recipientEmail: inboxRecipientEmail.value.trim() || null,
      },
    })
    Object.assign(inboxForm, response)
    inboxUsesFallback.value = response.usesEnvironmentFallback
    inboxRecipientEmail.value = response.usesEnvironmentFallback ? '' : (response.recipientEmail ?? '')
    toast.success('Careers inbox notifications saved')
  }
  catch (error) {
    toast.error('Unable to save careers inbox notifications', {
      message: error instanceof Error ? error.message : undefined,
    })
  }
  finally {
    savingInbox.value = false
  }
}
</script>

<template>
  <div class="ui-settings-page">
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Notifications</h1>
      <p class="mt-0.5 text-sm text-surface-500 dark:text-surface-400">
        Choose when new application emails reach you and the shared careers inbox.
      </p>
    </div>

    <section class="ui-panel ui-settings-panel">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10 shrink-0"><UserRound class="size-5" /></div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Personal notifications</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Only your Factory Careers account is affected. Personal emails are off until you opt in.</p>
          </div>
        </div>
      </div>

      <div class="ui-settings-panel-body space-y-5">
        <div v-if="personalStatus === 'pending'" class="flex items-center gap-2 text-sm text-surface-500"><Loader2 class="size-4 animate-spin" /> Loading preference…</div>
        <div v-else-if="personalStatus === 'error'" class="space-y-3 text-sm text-surface-600 dark:text-surface-300">
          <p>Unable to load your notification preference.</p>
          <button type="button" class="ui-button ui-button-secondary" @click="refreshPersonal()">Try again</button>
        </div>
        <template v-else>
          <div>
            <label for="personal-cadence" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Cadence</label>
            <select id="personal-cadence" v-model="personalForm.cadence" class="ui-field">
              <option v-for="option in cadenceOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <p class="mt-1.5 text-xs text-surface-500 dark:text-surface-400">{{ selectedCadenceHelp(personalForm.cadence) }}</p>
          </div>

          <div v-if="!['off', 'immediate'].includes(personalForm.cadence)" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="personal-time" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Delivery time</label>
              <input id="personal-time" v-model="personalForm.deliveryTime" type="time" class="ui-field" />
            </div>
            <div>
              <label for="personal-timezone" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">IANA timezone</label>
              <input id="personal-timezone" v-model="personalForm.timeZone" list="notification-timezones" class="ui-field" autocomplete="off" />
            </div>
            <div v-if="personalForm.cadence === 'weekly'">
              <label for="personal-weekday" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Weekday</label>
              <select id="personal-weekday" v-model.number="personalForm.weeklyDay" class="ui-field">
                <option v-for="day in weekdayOptions" :key="day.value" :value="day.value">{{ day.label }}</option>
              </select>
            </div>
            <div v-if="personalForm.cadence === 'monthly'">
              <label for="personal-monthly-day" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Day of month</label>
              <input id="personal-monthly-day" v-model.number="personalForm.monthlyDay" type="number" min="1" max="28" class="ui-field" />
            </div>
          </div>

          <div class="border border-surface-200 bg-surface-50 p-3 text-sm dark:border-surface-700 dark:bg-surface-900/40">
            <span class="font-medium text-surface-700 dark:text-surface-300">Next delivery:</span>
            <span class="ml-1 text-surface-600 dark:text-surface-400">{{ personalNextDelivery }}</span>
          </div>
          <button type="button" class="ui-button ui-button-primary" :disabled="savingPersonal" @click="savePersonal">
            <Loader2 v-if="savingPersonal" class="size-4 animate-spin" /><Save v-else class="size-4" /> Save personal preference
          </button>
        </template>
      </div>
    </section>

    <section v-if="canUpdateOrg" class="ui-panel ui-settings-panel">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10 shrink-0"><Inbox class="size-5" /></div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Careers inbox</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">An organization-wide channel managed separately from every member’s preference.</p>
          </div>
        </div>
      </div>

      <div class="ui-settings-panel-body space-y-5">
        <div v-if="inboxStatus === 'pending' || inboxStatus === 'idle'" class="flex items-center gap-2 text-sm text-surface-500"><Loader2 class="size-4 animate-spin" /> Loading inbox settings…</div>
        <div v-else-if="inboxStatus === 'error'" class="space-y-3 text-sm text-surface-600 dark:text-surface-300">
          <p>Unable to load careers inbox settings.</p>
          <button type="button" class="ui-button ui-button-secondary" @click="loadInbox()">Try again</button>
        </div>
        <template v-else>
          <div>
            <label for="inbox-email" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Recipient email</label>
            <input id="inbox-email" v-model="inboxRecipientEmail" type="email" class="ui-field" placeholder="Use deployment fallback" />
            <p class="mt-1.5 text-xs text-surface-500 dark:text-surface-400">
              Leave blank to use <code>FACTORY_CAREERS_HIRING_INBOX</code><span v-if="inboxUsesFallback && inbox?.recipientEmail"> (currently {{ inbox.recipientEmail }})</span>.
            </p>
          </div>
          <div>
            <label for="inbox-cadence" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Cadence</label>
            <select id="inbox-cadence" v-model="inboxForm.cadence" class="ui-field">
              <option v-for="option in cadenceOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <p class="mt-1.5 text-xs text-surface-500 dark:text-surface-400">{{ selectedCadenceHelp(inboxForm.cadence) }}</p>
          </div>

          <div v-if="!['off', 'immediate'].includes(inboxForm.cadence)" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="inbox-time" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Delivery time</label>
              <input id="inbox-time" v-model="inboxForm.deliveryTime" type="time" class="ui-field" />
            </div>
            <div>
              <label for="inbox-timezone" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">IANA timezone</label>
              <input id="inbox-timezone" v-model="inboxForm.timeZone" list="notification-timezones" class="ui-field" autocomplete="off" />
            </div>
            <div v-if="inboxForm.cadence === 'weekly'">
              <label for="inbox-weekday" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Weekday</label>
              <select id="inbox-weekday" v-model.number="inboxForm.weeklyDay" class="ui-field">
                <option v-for="day in weekdayOptions" :key="day.value" :value="day.value">{{ day.label }}</option>
              </select>
            </div>
            <div v-if="inboxForm.cadence === 'monthly'">
              <label for="inbox-monthly-day" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Day of month</label>
              <input id="inbox-monthly-day" v-model.number="inboxForm.monthlyDay" type="number" min="1" max="28" class="ui-field" />
            </div>
          </div>

          <div class="border border-surface-200 bg-surface-50 p-3 text-sm dark:border-surface-700 dark:bg-surface-900/40">
            <span class="font-medium text-surface-700 dark:text-surface-300">Next delivery:</span>
            <span class="ml-1 text-surface-600 dark:text-surface-400">{{ inboxNextDelivery }}</span>
          </div>
          <button type="button" class="ui-button ui-button-primary" :disabled="savingInbox" @click="saveInbox">
            <Loader2 v-if="savingInbox" class="size-4 animate-spin" /><Save v-else class="size-4" /> Save inbox setting
          </button>
        </template>
      </div>
    </section>

    <datalist id="notification-timezones">
      <option v-for="timeZone in timeZoneOptions" :key="timeZone" :value="timeZone" />
    </datalist>

    <div class="flex items-start gap-2 text-xs text-surface-500 dark:text-surface-400">
      <BellRing class="mt-0.5 size-4 shrink-0" /> Schedule changes apply to new applications. Turning a channel off cancels its unsent emails.
    </div>
  </div>
</template>
