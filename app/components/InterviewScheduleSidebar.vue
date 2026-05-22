<script setup lang="ts">
import {
  X, Calendar, Clock, MapPin, Users, ChevronLeft, ChevronRight,
  Plus, AlertCircle, Mail, ChevronDown, RefreshCw, Globe,
  Send, UserPlus, Bell, Pencil, CheckCircle2, ExternalLink,
  ArrowRight, Eye,
} from 'lucide-vue-next'
import { SYSTEM_TEMPLATES } from '~/utils/system-templates'

const props = withDefaults(defineProps<{
  applicationId: string
  candidateName: string
  jobTitle: string
  teleportTarget?: string | HTMLElement
}>(), {
  teleportTarget: 'body',
})

const emit = defineEmits<{
  close: []
  scheduled: [createdInterview?: { id: string; googleCalendarEventLink?: string | null }]
}>()

// ─── Success state ────────────────────────────────────────────────
const showSuccess = ref(false)
const createdInterview = ref<{ id: string; googleCalendarEventLink?: string | null } | null>(null)

// ─── Calendar integration status ──────────────────────────────────
const { isConnected: calendarConnected } = useCalendarIntegration()

// ─── Form state ───────────────────────────────────────────────────
const form = reactive({
  title: '',
  date: '',
  time: '10:00',
  duration: 60,
  location: '',
  notes: '',
  interviewers: [] as string[],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
})

const errors = ref<Record<string, string>>({})
const isSubmitting = ref(false)
const isMoving = ref(false)

// ─── Notification method ──────────────────────────────────────────
const notifyViaEmail = ref(false)
const notifyViaCalendar = ref(false)

// ─── Google Calendar event customization ──────────────────────────
const calendarCustomization = reactive({
  eventTitle: '',
  eventDescription: '',
  addCandidateAttendee: true,
  sendNotifications: true,
  showCustomize: false,
})

// ─── Email templates ──────────────────────────────────────────────
const { templates: customTemplates } = useEmailTemplates()
const selectedTemplateId = ref('system-standard')
const showTemplateDropdown = ref(false)

const allTemplates = computed(() => [
  ...SYSTEM_TEMPLATES.map(t => ({ id: t.id, name: t.name, description: t.description, isSystem: true as const })),
  ...(customTemplates.value ?? []).map(t => ({ id: t.id, name: t.name, description: '', isSystem: false as const })),
])

const selectedTemplateName = computed(() => {
  return allTemplates.value.find(t => t.id === selectedTemplateId.value)?.name ?? 'Select template'
})

// Set a sensible default title
// Helper to extract YYYY-MM-DD from a Date object in local timezone
function toDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

onMounted(() => {
  form.title = `Interview — ${props.candidateName}`
  calendarCustomization.eventTitle = `Interview — ${props.candidateName}`
  // Default date to tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  form.date = toDateString(tomorrow)
  // Auto-enable Google Calendar if connected
  if (calendarConnected.value) {
    notifyViaCalendar.value = true
  }
})

// ─── Duration presets ─────────────────────────────────────────────
const durationPresets = [15, 30, 45, 60, 90, 120]

function adjustDuration(delta: number) {
  const next = form.duration + delta
  if (next >= 5 && next <= 480) {
    form.duration = next
  }
}

// ─── Time slots ───────────────────────────────────────────────────
const timeSlots = computed(() => {
  const slots: string[] = []
  for (let h = 7; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
})

// ─── Calendar ─────────────────────────────────────────────────────
const calendarMonth = ref(new Date())

const calendarDays = computed(() => {
  const year = calendarMonth.value.getFullYear()
  const month = calendarMonth.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1 // Monday-start

  const days: { date: string; day: number; isCurrentMonth: boolean; isPast: boolean; isToday: boolean }[] = []

  // Padding from previous month
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({
      date: toDateString(d),
      day: d.getDate(),
      isCurrentMonth: false,
      isPast: d < new Date(toDateString(new Date())),
      isToday: false,
    })
  }

  // Current month days
  const today = toDateString(new Date())
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateObj = new Date(year, month, d)
    const dateStr = toDateString(dateObj)
    days.push({
      date: dateStr,
      day: d,
      isCurrentMonth: true,
      isPast: dateStr < today,
      isToday: dateStr === today,
    })
  }

  // Fill to complete grid (6 rows × 7 columns)
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i)
    days.push({
      date: toDateString(d),
      day: d.getDate(),
      isCurrentMonth: false,
      isPast: false,
      isToday: false,
    })
  }

  return days
})

const calendarMonthLabel = computed(() => {
  return calendarMonth.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

function prevMonth() {
  const d = new Date(calendarMonth.value)
  d.setMonth(d.getMonth() - 1)
  calendarMonth.value = d
}
function nextMonth() {
  const d = new Date(calendarMonth.value)
  d.setMonth(d.getMonth() + 1)
  calendarMonth.value = d
}

function selectDate(date: string) {
  form.date = date
}

// ─── Interviewers ─────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function addInterviewer() {
  form.interviewers.push('')
}
function removeInterviewer(idx: number) {
  form.interviewers.splice(idx, 1)
}

// ─── Common Timezones ─────────────────────────────────────────────
const commonTimezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Bucharest',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Ho_Chi_Minh',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
]

// ─── Formatted preview ───────────────────────────────────────────
const formattedDateTime = computed(() => {
  if (!form.date || !form.time) return ''
  const d = new Date(`${form.date}T${form.time}`)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
})

const endTime = computed(() => {
  if (!form.date || !form.time) return ''
  const d = new Date(`${form.date}T${form.time}`)
  d.setMinutes(d.getMinutes() + form.duration)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
})

// ─── Submit ───────────────────────────────────────────────────────
async function handleSubmit() {
  errors.value = {}

  if (!form.title.trim()) errors.value.title = 'Title is required'
  if (!form.date) errors.value.date = 'Date is required'
  if (!form.time) errors.value.time = 'Time is required'

  const scheduledDate = new Date(`${form.date}T${form.time}`)
  if (isNaN(scheduledDate.getTime())) {
    errors.value.date = 'Invalid date/time'
  }

  const filteredInterviewers = form.interviewers.filter(i => i.trim())
  const invalidEmails = filteredInterviewers.filter(e => !EMAIL_RE.test(e.trim()))
  if (invalidEmails.length > 0) {
    errors.value.interviewers = 'All interviewers must have a valid email address'
  }

  if (Object.keys(errors.value).length > 0) return

  isSubmitting.value = true
  try {

    const created = await $fetch('/api/interviews', {
      method: 'POST',
      body: {
        applicationId: props.applicationId,
        title: form.title.trim(),
        scheduledAt: scheduledDate.toISOString(),
        duration: form.duration,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        interviewers: filteredInterviewers.length > 0 ? filteredInterviewers : undefined,
        timezone: form.timezone,
        // Calendar sync preferences
        calendarSync: notifyViaCalendar.value,
        ...(notifyViaCalendar.value && {
          calendarEventTitle: calendarCustomization.eventTitle.trim() || undefined,
          calendarEventDescription: calendarCustomization.eventDescription.trim() || undefined,
          calendarAddCandidateAttendee: calendarCustomization.addCandidateAttendee,
          calendarSendUpdates: calendarCustomization.sendNotifications,
        }),
      },
    })

    // Optionally send invitation email
    if (notifyViaEmail.value && created?.id) {
      try {
        await $fetch(`/api/interviews/${created.id}/send-invitation`, {
          method: 'POST',
          body: { templateId: selectedTemplateId.value },
        })
      } catch {
        // Interview was created successfully — don't block on email failure.
      }
    }

    await refreshNuxtData('interviews')
    createdInterview.value = created ? { id: created.id, googleCalendarEventLink: created.googleCalendarEventLink ?? null } : null
    showSuccess.value = true
  } catch (err: any) {
    errors.value.submit = err?.data?.statusMessage ?? 'Failed to schedule interview'
  } finally {
    isSubmitting.value = false
  }
}

// ─── Move to interview stage (no scheduling) ──────────────────────
async function handleMoveToInterview() {
  isMoving.value = true
  errors.value = {}
  try {
    await $fetch(`/api/applications/${props.applicationId}`, {
      method: 'PATCH',
      body: { status: 'interview' },
    })
    await refreshNuxtData('interviews')
    emit('scheduled')
  } catch (err: any) {
    errors.value.submit = err?.data?.statusMessage ?? 'Failed to move to interview stage'
  } finally {
    isMoving.value = false
  }
}
</script>

<template>
  <Teleport :to="teleportTarget">
    <div
      class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 flex justify-end"
      @click.self="emit('close')"
    >
      <!-- Sidebar panel -->
      <Transition
        enter-active-class="transition duration-300 ease-out transform"
        enter-from-class="translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition duration-200 ease-in transform"
        leave-from-class="translate-x-0"
        leave-to-class="translate-x-full"
      >
        <div class="ui-drawer-panel relative w-full max-w-2xl overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="ui-drawer-header shrink-0 px-6 pt-5 pb-4">
            <div class="flex items-start justify-between">
              <div class="min-w-0">
                <div class="flex items-center gap-2.5 mb-1">
                  <div
                    class="ui-icon-state size-8 rounded-xl"
                    :class="showSuccess ? 'ui-icon-state-success' : 'ui-icon-state-brand'"
                  >
                    <CheckCircle2 v-if="showSuccess" class="size-4" />
                    <Calendar v-else class="size-4" />
                  </div>
                  <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-50 tracking-tight">
                    {{ showSuccess ? 'Interview Scheduled' : 'Schedule Interview' }}
                  </h2>
                </div>
                <p class="text-[13px] text-surface-500 dark:text-surface-400 truncate pl-[42px]">
                  {{ candidateName }} · {{ jobTitle }}
                </p>
              </div>
              <button
                class="ui-button ui-button-ghost p-2 -mr-1.5 -mt-0.5"
                @click="showSuccess ? emit('scheduled', createdInterview ?? undefined) : emit('close')"
              >
                <X class="size-4" />
              </button>
            </div>
          </div>

          <!-- ─── Success view ─────────────────────────────────── -->
          <template v-if="showSuccess">
            <div class="ui-drawer-body flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center">
              <!-- Success icon -->
              <div class="ui-icon-state ui-icon-state-success size-16 rounded-2xl mb-5">
                <CheckCircle2 class="size-8" />
              </div>

              <h3 class="text-base font-semibold text-surface-900 dark:text-surface-50 mb-1.5 text-center">
                Interview successfully scheduled
              </h3>
              <p class="text-sm text-surface-500 dark:text-surface-400 text-center max-w-sm mb-6">
                {{ form.title }} on {{ formattedDateTime }} ({{ form.duration }}m)
              </p>

              <!-- Notification summary -->
              <div v-if="notifyViaEmail || notifyViaCalendar" class="flex flex-wrap items-center justify-center gap-2 mb-6">
                <span v-if="notifyViaEmail" class="ui-pill ui-pill-brand gap-1.5">
                  <Mail class="size-3" />
                  Email sent
                </span>
                <span v-if="notifyViaCalendar" class="ui-pill ui-pill-success gap-1.5">
                  <Calendar class="size-3" />
                  Calendar event created
                </span>
              </div>

              <!-- Quick links -->
              <div class="w-full max-w-sm space-y-2.5">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-2">
                  Quick links
                </p>

                <!-- Google Calendar link -->
                <a
                  v-if="createdInterview?.googleCalendarEventLink"
                  :href="createdInterview.googleCalendarEventLink"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="ui-panel flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all group"
                >
                  <div class="ui-icon-state ui-icon-state-success size-8 rounded-lg">
                    <Calendar class="size-4" />
                  </div>
                  <span class="flex-1">Open in Google Calendar</span>
                  <ExternalLink class="size-3.5 text-surface-400 group-hover:text-emerald-500 transition-colors" />
                </a>

                <!-- View application -->
                <NuxtLink
                  :to="`/dashboard/applications/${applicationId}`"
                  class="ui-panel flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all group"
                  @click="emit('scheduled', createdInterview ?? undefined)"
                >
                  <div class="ui-icon-state ui-icon-state-brand size-8 rounded-lg">
                    <Eye class="size-4" />
                  </div>
                  <span class="flex-1">View application</span>
                  <ArrowRight class="size-3.5 text-surface-400 group-hover:text-brand-500 transition-colors" />
                </NuxtLink>

                <!-- Schedule another -->
                <button
                  type="button"
                  class="ui-panel flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-all group cursor-pointer"
                  @click="showSuccess = false; createdInterview = null"
                >
                  <div class="flex size-8 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-800">
                    <Plus class="size-4 text-surface-500 dark:text-surface-400" />
                  </div>
                  <span class="flex-1 text-left">Schedule another interview</span>
                  <ArrowRight class="size-3.5 text-surface-400 group-hover:text-surface-600 dark:group-hover:text-surface-300 transition-colors" />
                </button>
              </div>
            </div>

            <!-- Success footer -->
            <div class="ui-panel-footer shrink-0 px-6 py-4">
              <button
                type="button"
                class="ui-button ui-button-primary w-full px-4 py-2.5 text-sm font-semibold"
                @click="emit('scheduled', createdInterview ?? undefined)"
              >
                Done
              </button>
            </div>
          </template>

          <!-- ─── Form view ────────────────────────────────────── -->
          <template v-else>
          <!-- Form content -->
          <div class="ui-drawer-body flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <!-- Error banner -->
            <div v-if="errors.submit" class="ui-alert ui-alert-danger flex items-start gap-2.5 p-3.5 text-sm">
              <AlertCircle class="size-4 shrink-0 mt-0.5" />
              {{ errors.submit }}
            </div>

            <!-- Candidate notification -->
            <div>
              <label class="block text-[13px] font-medium text-surface-700 dark:text-surface-300 mb-2.5">
                <Send class="inline size-3.5 mr-1.5 -mt-0.5 text-surface-400" />
                Notify candidate
              </label>

              <div class="space-y-2">
                <!-- Option: Standard email -->
                <div class="ui-selectable-panel transition-all" :class="notifyViaEmail ? 'ui-selectable-panel-active' : ''">
                  <label class="flex items-center gap-3 cursor-pointer px-3.5 py-3 group">
                    <input
                      v-model="notifyViaEmail"
                      type="checkbox"
                      class="ui-checkbox ui-checkbox-brand size-4 cursor-pointer"
                    />
                    <Mail class="size-4 shrink-0 transition-colors" :class="notifyViaEmail ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400 dark:text-surface-500'" />
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-medium transition-colors" :class="notifyViaEmail ? 'text-surface-900 dark:text-surface-100' : 'text-surface-600 dark:text-surface-400'">
                        Standard email
                      </p>
                      <p class="text-[11px] text-surface-400 dark:text-surface-500">
                        Send interview invitation via email (noreply)
                      </p>
                    </div>
                  </label>

                  <!-- Email template picker (expanded when checked) -->
                  <div v-if="notifyViaEmail" class="px-3.5 pb-3.5 pt-0">
                    <div class="relative">
                      <label class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                        Email template
                      </label>
                      <button
                        type="button"
                        class="ui-field flex items-center justify-between px-3 py-2 text-sm text-left cursor-pointer"
                        @click="showTemplateDropdown = !showTemplateDropdown"
                      >
                        <span class="truncate text-surface-800 dark:text-surface-200">{{ selectedTemplateName }}</span>
                        <ChevronDown class="size-4 shrink-0 text-surface-400 transition-transform" :class="showTemplateDropdown ? 'rotate-180' : ''" />
                      </button>

                      <!-- Template dropdown -->
                      <Transition
                        enter-active-class="transition duration-150 ease-out"
                        enter-from-class="opacity-0 -translate-y-1"
                        enter-to-class="opacity-100 translate-y-0"
                        leave-active-class="transition duration-100 ease-in"
                        leave-from-class="opacity-100 translate-y-0"
                        leave-to-class="opacity-0 -translate-y-1"
                      >
                        <div v-if="showTemplateDropdown" class="ui-panel absolute z-10 mt-1 w-full overflow-hidden">
                          <!-- System templates -->
                          <div class="px-2.5 pt-2 pb-1">
                            <span class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">Built-in</span>
                          </div>
                          <button
                            v-for="t in allTemplates.filter(t => t.isSystem)"
                            :key="t.id"
                            type="button"
                            class="w-full flex items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors cursor-pointer"
                            :class="selectedTemplateId === t.id ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''"
                            @click="selectedTemplateId = t.id; showTemplateDropdown = false"
                          >
                            <div class="min-w-0 flex-1">
                              <p class="font-medium text-surface-800 dark:text-surface-200 truncate">{{ t.name }}</p>
                              <p v-if="t.description" class="text-xs text-surface-500 dark:text-surface-400 truncate">{{ t.description }}</p>
                            </div>
                            <div v-if="selectedTemplateId === t.id" class="shrink-0 mt-0.5 text-brand-600 dark:text-brand-400">
                              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </div>
                          </button>

                          <!-- Custom templates -->
                          <template v-if="allTemplates.some(t => !t.isSystem)">
                            <div class="border-t border-surface-100 dark:border-surface-700/60 mx-2.5" />
                            <div class="px-2.5 pt-2 pb-1">
                              <span class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">Custom</span>
                            </div>
                            <button
                              v-for="t in allTemplates.filter(t => !t.isSystem)"
                              :key="t.id"
                              type="button"
                              class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors cursor-pointer"
                              :class="selectedTemplateId === t.id ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''"
                              @click="selectedTemplateId = t.id; showTemplateDropdown = false"
                            >
                              <p class="font-medium text-surface-800 dark:text-surface-200 truncate flex-1">{{ t.name }}</p>
                              <div v-if="selectedTemplateId === t.id" class="shrink-0 text-brand-600 dark:text-brand-400">
                                <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </div>
                            </button>
                          </template>

                          <div class="h-1" />
                        </div>
                      </Transition>
                    </div>
                  </div>
                </div>

                <!-- Option: Google Calendar -->
                <div class="ui-selectable-panel transition-all" :class="notifyViaCalendar ? 'ui-selectable-panel-active' : ''">
                  <label class="flex items-center gap-3 px-3.5 py-3 group" :class="calendarConnected ? 'cursor-pointer' : 'cursor-default'">
                    <input
                      v-model="notifyViaCalendar"
                      type="checkbox"
                      :disabled="!calendarConnected"
                      class="ui-checkbox size-4 text-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <Calendar class="size-4 shrink-0 transition-colors" :class="notifyViaCalendar ? 'text-emerald-600 dark:text-emerald-400' : 'text-surface-400 dark:text-surface-500'" />
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-medium transition-colors" :class="notifyViaCalendar ? 'text-surface-900 dark:text-surface-100' : 'text-surface-600 dark:text-surface-400'">
                        Google Calendar
                      </p>
                      <p class="text-[11px] text-surface-400 dark:text-surface-500">
                        <template v-if="calendarConnected">Create calendar event with invite</template>
                        <template v-else>
                          <NuxtLink to="/dashboard/settings/integrations" class="underline underline-offset-2 hover:text-surface-600 dark:hover:text-surface-400 transition-colors" @click.stop>Connect in Settings</NuxtLink>
                          to enable
                        </template>
                      </p>
                    </div>
                    <!-- Customize toggle -->
                    <button
                      v-if="notifyViaCalendar && calendarConnected"
                      type="button"
                      class="ui-button ui-button-ghost shrink-0 p-1.5"
                      title="Customize event"
                      @click.prevent="calendarCustomization.showCustomize = !calendarCustomization.showCustomize"
                    >
                      <Pencil class="size-3.5" />
                    </button>
                  </label>

                  <!-- Google Calendar event customization (expanded) -->
                  <div v-if="notifyViaCalendar && calendarCustomization.showCustomize" class="px-3.5 pb-3.5 pt-0 space-y-3 border-t border-emerald-200/60 dark:border-emerald-800/30 mt-0">
                    <!-- Event title -->
                    <div>
                      <label for="cal-event-title" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                        Event title
                      </label>
                      <input
                        id="cal-event-title"
                        v-model="calendarCustomization.eventTitle"
                        type="text"
                        placeholder="Defaults to interview title"
                        class="ui-field px-3 py-1.5 text-[13px]"
                      />
                    </div>

                    <!-- Event description -->
                    <div>
                      <label for="cal-event-desc" class="block text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                        Event description
                      </label>
                      <textarea
                        id="cal-event-desc"
                        v-model="calendarCustomization.eventDescription"
                        rows="3"
                        placeholder="Leave empty to auto-generate from interview details"
                        class="ui-field px-3 py-1.5 text-[13px] resize-none"
                      />
                    </div>

                    <!-- Toggles row -->
                    <div class="flex flex-col gap-2">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          v-model="calendarCustomization.addCandidateAttendee"
                          type="checkbox"
                          class="ui-checkbox size-3.5 text-emerald-600 cursor-pointer"
                        />
                        <UserPlus class="size-3.5 text-surface-400" />
                        <span class="text-[12px] text-surface-600 dark:text-surface-400">Add candidate as attendee</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          v-model="calendarCustomization.sendNotifications"
                          type="checkbox"
                          class="ui-checkbox size-3.5 text-emerald-600 cursor-pointer"
                        />
                        <Bell class="size-3.5 text-surface-400" />
                        <span class="text-[12px] text-surface-600 dark:text-surface-400">Send Google Calendar notifications</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Hint if neither selected -->
              <p v-if="!notifyViaEmail && !notifyViaCalendar" class="mt-2 text-[11px] text-surface-400 dark:text-surface-500 italic">
                No notification will be sent — the interview will only be recorded internally.
              </p>
            </div>

            <!-- Title -->
            <div>
              <label for="interview-title" class="block text-[13px] font-medium text-surface-700 dark:text-surface-300 mb-2">
                Title
              </label>
              <input
                id="interview-title"
                v-model="form.title"
                type="text"
                placeholder="e.g., Technical Interview Round 1"
                class="ui-field px-4 py-2.5 text-sm"
                :class="errors.title ? 'border-danger-300 dark:border-danger-700' : 'border-surface-200 dark:border-surface-700/80'"
              />
              <p v-if="errors.title" class="mt-1.5 text-xs text-danger-600 dark:text-danger-400">{{ errors.title }}</p>
            </div>

            <!-- Date & Time -->
            <div>
              <label class="block text-[13px] font-medium text-surface-700 dark:text-surface-300 mb-2.5">
                Date & time
              </label>
              <div class="flex items-stretch gap-3 h-80">
                <!-- Calendar Date Picker -->
                <div class="ui-panel flex-1 overflow-hidden min-w-0 flex flex-col">
                  <!-- Month navigation -->
                  <div class="flex items-center justify-between px-3 py-2.5">
                    <button
                      type="button"
                      class="ui-button ui-button-ghost p-1.5"
                      @click="prevMonth"
                    >
                      <ChevronLeft class="size-4" />
                    </button>
                    <span class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ calendarMonthLabel }}</span>
                    <button
                      type="button"
                      class="ui-button ui-button-ghost p-1.5"
                      @click="nextMonth"
                    >
                      <ChevronRight class="size-4" />
                    </button>
                  </div>

                  <!-- Weekday headers -->
                  <div class="grid grid-cols-7 text-center px-2">
                    <div v-for="day in ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']" :key="day" class="pb-1.5 text-[11px] font-medium text-surface-400 dark:text-surface-500">
                      {{ day }}
                    </div>
                  </div>

                  <!-- Days grid -->
                  <div class="grid grid-cols-7 px-2 pb-2 gap-0.5">
                    <button
                      v-for="d in calendarDays"
                      :key="d.date"
                      type="button"
                      :disabled="d.isPast"
                      class="relative flex items-center justify-center rounded-lg h-9 text-[13px] transition-all duration-100 cursor-pointer"
                      :class="[
                        d.date === form.date
                          ? 'bg-brand-600 text-white font-semibold shadow-sm shadow-brand-500/25 dark:bg-brand-500'
                          : d.isToday
                            ? 'ring-1 ring-brand-300 text-brand-700 font-medium dark:ring-brand-700 dark:text-brand-300'
                            : d.isCurrentMonth
                              ? 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700/60'
                              : 'text-surface-300 dark:text-surface-600',
                        d.isPast ? 'opacity-30 cursor-not-allowed' : '',
                      ]"
                      @click="!d.isPast && selectDate(d.date)"
                    >
                      {{ d.day }}
                    </button>
                  </div>
                </div>

                <!-- Time Picker -->
                <div class="ui-panel w-[96px] shrink-0 overflow-hidden flex flex-col">
                  <!-- Time header -->
                  <div class="flex items-center justify-center px-3 py-2.5 shrink-0">
                    <span class="text-sm font-semibold text-surface-800 dark:text-surface-200">Time</span>
                  </div>
                  <!-- Spacer to perfectly match calendar weekday headers -->
                  <div class="px-2 shrink-0">
                    <div class="pb-1.5 text-[11px] font-medium text-transparent select-none whitespace-nowrap">
                      Time
                    </div>
                  </div>
                  <!-- Time List -->
                  <div class="flex-1 overflow-y-auto px-1.5 pb-2 flex flex-col gap-0.5 min-h-0">
                    <button
                      v-for="slot in timeSlots"
                      :key="slot"
                      type="button"
                      class="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-center transition-all duration-100 cursor-pointer"
                      :class="form.time === slot
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25 dark:bg-brand-500'
                        : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700/60'"
                      @click="form.time = slot"
                    >
                      {{ slot }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Errors -->
              <div v-if="errors.date || errors.time" class="mt-1.5 flex flex-col gap-1">
                <p v-if="errors.date" class="text-xs text-danger-600 dark:text-danger-400">Date: {{ errors.date }}</p>
                <p v-if="errors.time" class="text-xs text-danger-600 dark:text-danger-400">Time: {{ errors.time }}</p>
              </div>

              <!-- Duration -->
              <div class="mt-3">
                <span class="text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-2 block">Duration</span>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="preset in durationPresets"
                    :key="preset"
                    type="button"
                    class="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer text-center"
                    :class="form.duration === preset
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700'"
                    @click="form.duration = preset"
                  >
                    {{ preset }}m
                  </button>
                </div>
              </div>

              <!-- Timezone -->
              <div class="mt-3">
                <label for="interview-timezone" class="text-[12px] font-medium text-surface-500 dark:text-surface-400 mb-1.5 flex items-center gap-1.5">
                  <Globe class="size-3 text-surface-400" />
                  Timezone
                </label>
                <select
                  id="interview-timezone"
                  v-model="form.timezone"
                  class="ui-field px-3 py-1.5 text-[13px] cursor-pointer"
                >
                  <option v-for="tz in commonTimezones" :key="tz" :value="tz">{{ tz }}</option>
                </select>
              </div>
            </div>

            <!-- Location -->
            <div>
              <label for="interview-location" class="block text-[13px] font-medium text-surface-700 dark:text-surface-300 mb-2">
                <MapPin class="inline size-3.5 mr-1.5 -mt-0.5 text-surface-400" />
                Location or meeting link
              </label>
              <input
                id="interview-location"
                v-model="form.location"
                type="text"
                placeholder="Zoom link, office address…"
                class="ui-field px-4 py-2.5 text-sm"
              />
            </div>

            <!-- Interviewers -->
            <div>
              <label class="block text-[13px] font-medium text-surface-700 dark:text-surface-300 mb-2">
                <Users class="inline size-3.5 mr-1.5 -mt-0.5 text-surface-400" />
                Interviewers
                <span class="font-normal text-surface-400 dark:text-surface-500">(optional)</span>
              </label>
              <div class="space-y-2">
                <div v-for="(email, idx) in form.interviewers" :key="idx" class="flex items-center gap-2">
                  <input
                    v-model="form.interviewers[idx]"
                    type="email"
                    :placeholder="`interviewer${idx + 1}@example.com`"
                    :class="errors.interviewers && email.trim() && !EMAIL_RE.test(email.trim()) ? 'border-danger-300 dark:border-danger-700' : 'border-surface-200 dark:border-surface-700/80'"
                    class="ui-field flex-1 px-4 py-2 text-sm"
                  />
                  <button
                    v-if="form.interviewers.length > 1"
                    type="button"
                    class="ui-button ui-button-ghost ui-button-ghost-danger p-1.5"
                    @click="removeInterviewer(idx)"
                  >
                    <X class="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  class="ui-button ui-button-ghost gap-1.5 px-2.5 py-1.5 text-[13px]"
                  @click="addInterviewer"
                >
                  <Plus class="size-3.5" />
                  Add interviewer
                </button>
                <p v-if="errors.interviewers" class="mt-1 text-xs text-danger-600 dark:text-danger-400">{{ errors.interviewers }}</p>
              </div>
            </div>

            <!-- Notes -->
            <div>
              <label for="interview-notes" class="block text-[13px] font-medium text-surface-700 dark:text-surface-300 mb-2">
                Notes
                <span class="font-normal text-surface-400 dark:text-surface-500">(optional)</span>
              </label>
              <textarea
                id="interview-notes"
                v-model="form.notes"
                rows="2"
                placeholder="Topics to cover, preparation notes…"
                class="ui-field px-4 py-2.5 text-sm resize-none"
              />
            </div>

          </div>

          <!-- Footer with preview + submit -->
          <div class="ui-panel-footer shrink-0 px-6 py-4">
            <!-- Preview -->
            <div v-if="form.date && form.time" class="mb-3 flex items-center gap-2 min-w-0">
              <Calendar class="size-3.5 shrink-0 text-brand-500 dark:text-brand-400" />
              <span class="text-[12px] font-semibold text-surface-800 dark:text-surface-200 truncate">{{ formattedDateTime }}</span>
              <span class="text-[12px] text-surface-400 dark:text-surface-500 shrink-0">· {{ form.duration }}m</span>
              <span class="text-[11px] text-surface-400 dark:text-surface-500 shrink-0">· {{ form.timezone.split('/').pop()?.replace(/_/g, ' ') }}</span>
            </div>

            <!-- Notification summary -->
            <div v-if="notifyViaEmail || notifyViaCalendar" class="mb-3 flex flex-wrap items-center gap-1.5">
              <span v-if="notifyViaEmail" class="ui-pill ui-pill-brand gap-1">
                <Mail class="size-3" />
                Email
              </span>
              <span v-if="notifyViaCalendar" class="ui-pill ui-pill-success gap-1">
                <Calendar class="size-3" />
                Google Calendar
              </span>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                class="ui-button ui-button-secondary flex-1 px-4 py-2.5 text-sm"
                :disabled="isSubmitting || isMoving"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="isSubmitting || isMoving"
                class="ui-button ui-button-primary flex-[1.5] px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleSubmit"
              >
                {{ isSubmitting ? 'Scheduling…' : 'Schedule Interview' }}
              </button>
            </div>
            <div class="mt-2.5 text-center">
              <button
                type="button"
                :disabled="isSubmitting || isMoving"
                class="ui-inline-link text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleMoveToInterview"
              >
                {{ isMoving ? 'Moving…' : 'Skip scheduling — just move to interview stage' }}
              </button>
            </div>
          </div>
          </template>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
