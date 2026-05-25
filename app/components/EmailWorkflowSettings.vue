<script setup lang="ts">
import { Save } from 'lucide-vue-next'

const {
  sendApplicationAcknowledgement,
  applicationAcknowledgementTemplateId,
  applicationAcknowledgementDelayMinutes,
  applicationAcknowledgementBusinessHoursOnly,
  sendApplicationRejection,
  applicationRejectionTemplateId,
  applicationRejectionDelayMinutes,
  applicationRejectionBusinessHoursOnly,
  interviewInvitationTemplateId,
  emailBusinessHoursTimezone,
  emailBusinessHoursStartHour,
  emailBusinessHoursEndHour,
  updateSettings,
} = useOrgSettings()
const { templates } = useEmailTemplates()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()

type TemplatePurpose = 'interview_invitation' | 'application_acknowledgement' | 'application_rejection'

const workflowForm = reactive({
  sendApplicationAcknowledgement: true,
  applicationAcknowledgementTemplateId: 'system-application-acknowledgement',
  applicationAcknowledgementDelayMinutes: 0,
  applicationAcknowledgementBusinessHoursOnly: false,
  sendApplicationRejection: false,
  applicationRejectionTemplateId: 'system-application-rejection',
  applicationRejectionDelayMinutes: 0,
  applicationRejectionBusinessHoursOnly: false,
  interviewInvitationTemplateId: 'system-standard',
  emailBusinessHoursTimezone: 'America/New_York',
  emailBusinessHoursStartHour: 9,
  emailBusinessHoursEndHour: 17,
})

const isSavingWorkflows = ref(false)

watchEffect(() => {
  workflowForm.sendApplicationAcknowledgement = sendApplicationAcknowledgement.value
  workflowForm.applicationAcknowledgementTemplateId = applicationAcknowledgementTemplateId.value ?? 'system-application-acknowledgement'
  workflowForm.applicationAcknowledgementDelayMinutes = applicationAcknowledgementDelayMinutes.value
  workflowForm.applicationAcknowledgementBusinessHoursOnly = applicationAcknowledgementBusinessHoursOnly.value
  workflowForm.sendApplicationRejection = sendApplicationRejection.value
  workflowForm.applicationRejectionTemplateId = applicationRejectionTemplateId.value ?? 'system-application-rejection'
  workflowForm.applicationRejectionDelayMinutes = applicationRejectionDelayMinutes.value
  workflowForm.applicationRejectionBusinessHoursOnly = applicationRejectionBusinessHoursOnly.value
  workflowForm.interviewInvitationTemplateId = interviewInvitationTemplateId.value ?? 'system-standard'
  workflowForm.emailBusinessHoursTimezone = emailBusinessHoursTimezone.value
  workflowForm.emailBusinessHoursStartHour = emailBusinessHoursStartHour.value
  workflowForm.emailBusinessHoursEndHour = emailBusinessHoursEndHour.value
})

const templateOptionsByPurpose = computed(() => {
  const grouped: Record<TemplatePurpose, Array<{ id: string; name: string; isSystem: boolean }>> = {
    interview_invitation: [],
    application_acknowledgement: [],
    application_rejection: [],
  }

  for (const template of SYSTEM_TEMPLATES) {
    grouped[template.purpose].push({ id: template.id, name: template.name, isSystem: true })
  }

  for (const template of templates.value ?? []) {
    grouped[template.purpose].push({ id: template.id, name: template.name, isSystem: false })
  }

  return grouped
})

const applicationAcknowledgementTemplateOptions = computed(() =>
  templateOptionsByPurpose.value.application_acknowledgement.map(option => ({
    value: option.id,
    label: `${option.name}${option.isSystem ? ' (built-in)' : ''}`,
  })),
)

const applicationRejectionTemplateOptions = computed(() =>
  templateOptionsByPurpose.value.application_rejection.map(option => ({
    value: option.id,
    label: `${option.name}${option.isSystem ? ' (built-in)' : ''}`,
  })),
)

const interviewInvitationTemplateOptions = computed(() =>
  templateOptionsByPurpose.value.interview_invitation.map(option => ({
    value: option.id,
    label: `${option.name}${option.isSystem ? ' (built-in)' : ''}`,
  })),
)

const workflowDelayOptions = [
  { value: 0, label: 'Send immediately' },
  { value: 15, label: 'After 15 minutes' },
  { value: 60, label: 'After 1 hour' },
  { value: 240, label: 'After 4 hours' },
  { value: 1440, label: 'After 1 day' },
]

const businessHourTimezoneOptions = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
]

function formatHourLabel(hour: number) {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour === 24) return '12:00 AM'
  return `${hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

const businessHourStartOptions = computed(() =>
  Array.from({ length: 24 }, (_, hour) => ({
    value: hour,
    label: formatHourLabel(hour),
  })),
)

const businessHourEndOptions = computed(() =>
  Array.from({ length: 24 - workflowForm.emailBusinessHoursStartHour }, (_, index) => {
    const hour = workflowForm.emailBusinessHoursStartHour + index + 1
    return {
      value: hour,
      label: formatHourLabel(hour),
    }
  }),
)

watch(() => workflowForm.emailBusinessHoursStartHour, (startHour) => {
  if (workflowForm.emailBusinessHoursEndHour <= startHour) {
    workflowForm.emailBusinessHoursEndHour = Math.min(24, startHour + 1)
  }
})

async function saveWorkflowSettings() {
  isSavingWorkflows.value = true
  try {
    await updateSettings({
      sendApplicationAcknowledgement: workflowForm.sendApplicationAcknowledgement,
      applicationAcknowledgementTemplateId: workflowForm.applicationAcknowledgementTemplateId,
      applicationAcknowledgementDelayMinutes: workflowForm.applicationAcknowledgementDelayMinutes,
      applicationAcknowledgementBusinessHoursOnly: workflowForm.applicationAcknowledgementBusinessHoursOnly,
      sendApplicationRejection: workflowForm.sendApplicationRejection,
      applicationRejectionTemplateId: workflowForm.applicationRejectionTemplateId,
      applicationRejectionDelayMinutes: workflowForm.applicationRejectionDelayMinutes,
      applicationRejectionBusinessHoursOnly: workflowForm.applicationRejectionBusinessHoursOnly,
      interviewInvitationTemplateId: workflowForm.interviewInvitationTemplateId,
      emailBusinessHoursTimezone: workflowForm.emailBusinessHoursTimezone,
      emailBusinessHoursStartHour: workflowForm.emailBusinessHoursStartHour,
      emailBusinessHoursEndHour: workflowForm.emailBusinessHoursEndHour,
    })
    toast.success('Workflow settings saved')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save workflow settings', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isSavingWorkflows.value = false
  }
}
</script>

<template>
  <section class="ui-panel ui-dashboard-panel">
    <div class="ui-panel-header ui-dashboard-panel-header flex items-start justify-between gap-4">
      <div>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
          Workflow Settings
        </h2>
        <p class="mt-1 text-xs text-surface-500 dark:text-surface-400">
          Choose templates, delays, and business-hour rules for automated candidate emails.
        </p>
      </div>
      <button
        :disabled="isSavingWorkflows"
        class="ui-button ui-button-primary inline-flex shrink-0 cursor-pointer items-center gap-1.5 px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        @click="saveWorkflowSettings"
      >
        <Save class="size-4" />
        {{ isSavingWorkflows ? 'Saving...' : 'Save' }}
      </button>
    </div>

    <div class="border-b border-surface-200 px-5 py-4 dark:border-surface-800">
      <div class="grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)] lg:items-start">
        <div>
          <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">
            Business hours
          </h3>
          <p class="mt-1 max-w-md text-sm leading-6 text-surface-500 dark:text-surface-400">
            Monday-Friday window used when a workflow is set to send during business hours only.
          </p>
        </div>
        <div class="grid gap-3 md:grid-cols-[minmax(13rem,1.25fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)]">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400" for="email-business-hours-timezone">
              Timezone
            </label>
            <FactorySelect
              id="email-business-hours-timezone"
              v-model="workflowForm.emailBusinessHoursTimezone"
              :options="businessHourTimezoneOptions"
              class="email-workflow-select"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400" for="email-business-hours-start">
              Start
            </label>
            <FactorySelect
              id="email-business-hours-start"
              v-model="workflowForm.emailBusinessHoursStartHour"
              :options="businessHourStartOptions"
              class="email-workflow-select email-workflow-delay-select"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400" for="email-business-hours-end">
              End
            </label>
            <FactorySelect
              id="email-business-hours-end"
              v-model="workflowForm.emailBusinessHoursEndHour"
              :options="businessHourEndOptions"
              class="email-workflow-select email-workflow-delay-select"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="divide-y divide-surface-200 dark:divide-surface-800">
      <div class="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)] lg:items-start">
        <div class="lg:pt-1.5">
          <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">
            Application acknowledgement
          </h3>
          <p class="mt-1 max-w-md text-sm leading-6 text-surface-500 dark:text-surface-400">
            Thank candidates after a public application is submitted.
          </p>
        </div>

        <div class="space-y-3">
          <div class="grid gap-3 lg:grid-cols-[7rem_minmax(0,1fr)] lg:items-center">
            <label class="inline-flex h-10 w-28 items-center justify-between border border-white/16 bg-white/[0.035] px-3 text-sm font-semibold text-surface-700 dark:text-surface-100 lg:w-full">
              <input v-model="workflowForm.sendApplicationAcknowledgement" type="checkbox" class="peer sr-only" />
              <span class="email-workflow-toggle-track relative h-6 w-11 border border-surface-400 bg-surface-200 transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:bg-white after:shadow-sm after:transition-transform peer-checked:border-brand-500 peer-checked:bg-brand-600 peer-checked:after:translate-x-5 dark:border-surface-500 dark:bg-surface-800 peer-checked:dark:border-brand-400 peer-checked:dark:bg-brand-500" />
              <span>{{ workflowForm.sendApplicationAcknowledgement ? 'On' : 'Off' }}</span>
            </label>
            <div>
              <label class="sr-only" for="application-acknowledgement-template">
                Application acknowledgement template
              </label>
              <FactorySelect
                id="application-acknowledgement-template"
                v-model="workflowForm.applicationAcknowledgementTemplateId"
                :options="applicationAcknowledgementTemplateOptions"
                class="email-workflow-select"
              />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-center lg:pl-[calc(7rem+0.75rem)]">
            <div>
              <label class="sr-only" for="application-acknowledgement-delay">
                Application acknowledgement send timing
              </label>
              <FactorySelect
                id="application-acknowledgement-delay"
                v-model="workflowForm.applicationAcknowledgementDelayMinutes"
                :options="workflowDelayOptions"
                class="email-workflow-select email-workflow-delay-select"
              />
            </div>
            <label class="inline-flex min-h-10 items-center gap-2 border border-white/16 bg-white/[0.035] px-3 text-xs font-medium text-surface-200">
              <input
                v-model="workflowForm.applicationAcknowledgementBusinessHoursOnly"
                type="checkbox"
                class="size-3.5 accent-brand-500"
              />
              Business hours only
            </label>
          </div>
        </div>
      </div>

      <div class="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)] lg:items-start">
        <div class="lg:pt-1.5">
          <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">
            Interview invitation
          </h3>
          <p class="mt-1 max-w-md text-sm leading-6 text-surface-500 dark:text-surface-400">
            Default for invitations sent without choosing a template.
          </p>
        </div>

        <div class="grid gap-3 lg:grid-cols-[7rem_minmax(0,1fr)] lg:items-center">
          <span class="inline-flex h-10 w-28 items-center justify-center border border-white/12 bg-white/[0.025] px-3 text-sm font-medium text-surface-400 dark:text-surface-500 lg:w-full">
            Default
          </span>
          <div>
            <label class="sr-only" for="interview-invitation-template">
              Interview invitation template
            </label>
            <FactorySelect
              id="interview-invitation-template"
              v-model="workflowForm.interviewInvitationTemplateId"
              :options="interviewInvitationTemplateOptions"
              class="email-workflow-select"
            />
          </div>
        </div>
      </div>

      <div class="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)] lg:items-start">
        <div class="lg:pt-1.5">
          <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">
            Rejection notification
          </h3>
          <p class="mt-1 max-w-md text-sm leading-6 text-surface-500 dark:text-surface-400">
            Notify candidates when an application moves to rejected.
          </p>
        </div>

        <div class="space-y-3">
          <div class="grid gap-3 lg:grid-cols-[7rem_minmax(0,1fr)] lg:items-center">
            <label class="inline-flex h-10 w-28 items-center justify-between border border-white/16 bg-white/[0.035] px-3 text-sm font-semibold text-surface-700 dark:text-surface-100 lg:w-full">
              <input v-model="workflowForm.sendApplicationRejection" type="checkbox" class="peer sr-only" />
              <span class="email-workflow-toggle-track relative h-6 w-11 border border-surface-400 bg-surface-200 transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:bg-white after:shadow-sm after:transition-transform peer-checked:border-brand-500 peer-checked:bg-brand-600 peer-checked:after:translate-x-5 dark:border-surface-500 dark:bg-surface-800 peer-checked:dark:border-brand-400 peer-checked:dark:bg-brand-500" />
              <span>{{ workflowForm.sendApplicationRejection ? 'On' : 'Off' }}</span>
            </label>
            <div>
              <label class="sr-only" for="application-rejection-template">
                Rejection notification template
              </label>
              <FactorySelect
                id="application-rejection-template"
                v-model="workflowForm.applicationRejectionTemplateId"
                :options="applicationRejectionTemplateOptions"
                class="email-workflow-select"
              />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-center lg:pl-[calc(7rem+0.75rem)]">
            <div>
              <label class="sr-only" for="application-rejection-delay">
                Rejection notification send timing
              </label>
              <FactorySelect
                id="application-rejection-delay"
                v-model="workflowForm.applicationRejectionDelayMinutes"
                :options="workflowDelayOptions"
                class="email-workflow-select email-workflow-delay-select"
              />
            </div>
            <label class="inline-flex min-h-10 items-center gap-2 border border-white/16 bg-white/[0.035] px-3 text-xs font-medium text-surface-200">
              <input
                v-model="workflowForm.applicationRejectionBusinessHoursOnly"
                type="checkbox"
                class="size-3.5 accent-brand-500"
              />
              Business hours only
            </label>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
