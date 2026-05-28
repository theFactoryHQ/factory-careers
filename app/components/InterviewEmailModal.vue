<script setup lang="ts">
import {
  X, Mail, Send, ChevronDown, Eye, Pencil, FileText,
  Check, Plus, Trash2, Save, Sparkles,
} from 'lucide-vue-next'
import type { Interview } from '~/composables/useInterviews'
import type { EmailTemplate } from '~/composables/useEmailTemplates'

const props = defineProps<{
  interview: Interview
}>()

const emit = defineEmits<{
  close: []
  sent: []
}>()

const toast = useToast()
const { templates, createTemplate, deleteTemplate, sendInvitation } = useEmailTemplates()
const { formatPersonName } = useOrgSettings()

// ─── System templates (from shared utility — auto-imported) ────

// ─── State ────────────────────────────────────────────────────────
type Tab = 'template' | 'custom' | 'manage'
const activeTab = ref<Tab>('template')
const selectedTemplateId = ref<string>('system-standard')
const showPreview = ref(false)
const isSending = ref(false)
const sendSuccess = ref(false)

// Custom email state
const customSubject = ref('')
const customBody = ref('')

// New template form state
const showNewTemplateForm = ref(false)
const newTemplateName = ref('')
const newTemplateSubject = ref('')
const newTemplateBody = ref('')
const isSavingTemplate = ref(false)

// ─── Computed ─────────────────────────────────────────────────────
const allTemplates = computed(() => [
  ...SYSTEM_TEMPLATES.map(t => ({ ...t, isSystem: true as const })),
  ...(templates.value ?? []).map(t => ({ ...t, isSystem: false as const })),
])

const selectedTemplate = computed(() =>
  allTemplates.value.find(t => t.id === selectedTemplateId.value),
)

const { activeOrg } = useCurrentOrg()

const previewVariables: Record<string, string> = {
  candidateName: `${props.interview.candidateFirstName} ${props.interview.candidateLastName}`,
  candidateFirstName: props.interview.candidateFirstName,
  candidateLastName: props.interview.candidateLastName,
  candidateEmail: props.interview.candidateEmail,
  jobTitle: props.interview.jobTitle,
  interviewTitle: props.interview.title,
  interviewDate: new Date(props.interview.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }),
  interviewTime: new Date(props.interview.scheduledAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }),
  interviewDuration: String(props.interview.duration),
  interviewType: {
    video: 'Video Call', phone: 'Phone Call', in_person: 'In Person',
    technical: 'Technical Interview', panel: 'Panel Interview', take_home: 'Take-Home Assignment',
  }[props.interview.type] ?? props.interview.type,
  interviewLocation: props.interview.location ?? 'To be confirmed',
  interviewers: props.interview.interviewers?.join(', ') ?? 'To be confirmed',
  organizationName: activeOrg.value?.name ?? 'Your Organization',
}

const previewSubject = computed(() => {
  if (activeTab.value === 'custom') return renderTemplatePreview(customSubject.value, previewVariables)
  return selectedTemplate.value ? renderTemplatePreview(selectedTemplate.value.subject, previewVariables) : ''
})

const previewBody = computed(() => {
  if (activeTab.value === 'custom') return renderTemplatePreview(customBody.value, previewVariables)
  return selectedTemplate.value ? renderTemplatePreview(selectedTemplate.value.body, previewVariables) : ''
})

// ─── Actions ──────────────────────────────────────────────────────
async function handleSend() {
  isSending.value = true

  try {
    const payload = activeTab.value === 'custom'
      ? { customSubject: customSubject.value, customBody: customBody.value }
      : { templateId: selectedTemplateId.value }

    await sendInvitation(props.interview.id, payload)
    sendSuccess.value = true
    setTimeout(() => emit('sent'), 1500)
  } catch (err: any) {
    toast.error('Failed to send invitation email', { message: err?.data?.statusMessage ?? err?.message, statusCode: err?.data?.statusCode })
  } finally {
    isSending.value = false
  }
}

async function handleSaveTemplate() {
  if (!newTemplateName.value.trim() || !newTemplateSubject.value.trim() || !newTemplateBody.value.trim()) {
    toast.error('All fields are required')
    return
  }

  isSavingTemplate.value = true
  try {
    await createTemplate({
      name: newTemplateName.value.trim(),
      subject: newTemplateSubject.value.trim(),
      body: newTemplateBody.value.trim(),
    })
    showNewTemplateForm.value = false
    newTemplateName.value = ''
    newTemplateSubject.value = ''
    newTemplateBody.value = ''
  } catch (err: any) {
    toast.error('Failed to save template', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isSavingTemplate.value = false
  }
}

async function handleDeleteTemplate(id: string) {
  try {
    await deleteTemplate(id)
    if (selectedTemplateId.value === id) {
      selectedTemplateId.value = 'system-standard'
    }
  } catch {
    // Handled by composable
  }
}

const canSend = computed(() => {
  if (activeTab.value === 'custom') {
    return customSubject.value.trim().length > 0 && customBody.value.trim().length > 0
  }
  return !!selectedTemplateId.value
})

// Use AVAILABLE_VARIABLES from auto-imported ~/utils/system-templates
</script>

<template>
  <AppModalShell @close="emit('close')">
    <!-- Modal -->
    <AppModalPanel class="ui-email-modal-panel">
        <!-- Header -->
        <div class="ui-panel-header ui-email-modal-header">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="ui-icon-state ui-icon-state-brand size-9 rounded-lg">
                <Mail class="size-4.5" />
              </div>
              <div>
                <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">
                  Send Interview Invitation
                </h2>
                <p class="text-xs text-surface-500 dark:text-surface-400">
                  to {{ formatPersonName(interview.candidateFirstName, interview.candidateLastName) }} · {{ interview.candidateEmail }}
                </p>
              </div>
            </div>
            <button
              class="ui-button ui-button-ghost p-1.5"
              aria-label="Close interview invitation modal"
              @click="emit('close')"
            >
              <X class="size-5" />
            </button>
          </div>
        </div>

        <!-- Success state -->
        <div v-if="sendSuccess" class="ui-modal-success-state">
          <div class="ui-icon-state ui-icon-state-success size-14 mb-4">
            <Check class="size-7" />
          </div>
          <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1.5">Invitation Sent!</h3>
          <p class="text-sm text-surface-500 dark:text-surface-400 text-center">
            The interview invitation has been sent to {{ interview.candidateEmail }}.
          </p>
        </div>

        <!-- Main content -->
        <template v-else>
          <!-- Tabs -->
          <div class="ui-panel-header ui-email-modal-tabs scrollbar-none">
            <div class="flex gap-1">
              <button
                v-for="tab in ([
                  { id: 'template' as Tab, label: 'Choose Template', icon: FileText },
                  { id: 'custom' as Tab, label: 'Custom Email', icon: Pencil },
                  { id: 'manage' as Tab, label: 'Manage Templates', icon: Sparkles },
                ])"
                :key="tab.id"
                class="ui-tab flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium cursor-pointer -mb-px whitespace-nowrap shrink-0"
                :class="activeTab === tab.id
                  ? 'ui-tab-active'
                  : 'ui-tab-inactive'"
                @click="activeTab = tab.id"
              >
                <component :is="tab.icon" class="size-3.5" />
                {{ tab.label }}
              </button>
            </div>
          </div>

          <!-- Tab content -->
          <div class="ui-email-modal-body">
            <!-- Template Selection Tab -->
            <div v-if="activeTab === 'template'" class="space-y-3">
              <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">
                Select a template to send the interview invitation.
              </p>
              <button
                v-for="t in allTemplates"
                :key="t.id"
                type="button"
                class="ui-selectable-panel ui-email-modal-selectable"
                :class="selectedTemplateId === t.id
                  ? 'ui-selectable-panel-active'
                  : ''"
                @click="selectedTemplateId = t.id"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ t.name }}</span>
                  <span v-if="t.isSystem" class="ui-pill text-[10px] uppercase font-semibold px-1.5 py-0.5">
                    Built-in
                  </span>
                </div>
                <p class="text-xs text-surface-500 dark:text-surface-400 truncate">
                  Subject: {{ t.subject }}
                </p>
              </button>

              <!-- Preview toggle -->
              <div v-if="selectedTemplate" class="mt-4">
                <button
                  type="button"
                  class="ui-disclosure-trigger inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                  @click="showPreview = !showPreview"
                >
                  <Eye class="size-3.5" />
                  {{ showPreview ? 'Hide Preview' : 'Show Preview' }}
                  <ChevronDown
                    class="size-3.5 transition-transform"
                    :class="showPreview ? 'rotate-180' : ''"
                  />
                </button>
                <div v-if="showPreview" class="ui-panel-muted ui-email-modal-preview">
                  <div class="mb-2">
                    <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400">Subject</span>
                    <p class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ previewSubject }}</p>
                  </div>
                  <div>
                    <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400">Body</span>
                    <p class="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap mt-1">{{ previewBody }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Custom Email Tab -->
            <div v-else-if="activeTab === 'custom'" class="space-y-4">
              <div>
                <label for="custom-subject" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1.5">
                  Subject Line
                </label>
                <input
                  id="custom-subject"
                  v-model="customSubject"
                  type="text"
                  placeholder="e.g., Interview Invitation: {{jobTitle}}"
                  class="ui-field py-2.5"
                />
              </div>

              <div>
                <label for="custom-body" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-1.5">
                  Email Body
                </label>
                <textarea
                  id="custom-body"
                  v-model="customBody"
                  rows="10"
                  placeholder="Write your invitation email here. Use {{variables}} for dynamic content..."
                  class="ui-field py-2.5 resize-none font-mono"
                />
              </div>

              <!-- Variable reference -->
              <div class="ui-panel-muted ui-email-modal-variable-panel">
                <p class="text-[10px] uppercase tracking-wider font-semibold text-surface-400 mb-2">Available Variables</p>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="v in AVAILABLE_VARIABLES"
                    :key="v.key"
                    class="ui-code inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                    :title="v.desc"
                  >
                    {{ v.key }}
                  </span>
                </div>
              </div>

              <!-- Preview -->
              <div v-if="customSubject || customBody">
                <button
                  type="button"
                  class="ui-disclosure-trigger inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                  @click="showPreview = !showPreview"
                >
                  <Eye class="size-3.5" />
                  {{ showPreview ? 'Hide Preview' : 'Preview with Real Data' }}
                </button>
                <div v-if="showPreview" class="ui-panel-muted ui-email-modal-preview">
                  <div class="mb-2">
                    <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400">Subject</span>
                    <p class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ previewSubject }}</p>
                  </div>
                  <div>
                    <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400">Body</span>
                    <p class="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap mt-1">{{ previewBody }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Manage Templates Tab -->
            <div v-else-if="activeTab === 'manage'" class="space-y-4">
              <div class="flex items-center justify-between">
                <p class="text-xs text-surface-500 dark:text-surface-400">
                  Create and manage reusable email templates for your organization.
                </p>
                <button
                  v-if="!showNewTemplateForm"
                  type="button"
                  class="ui-button ui-button-primary px-3 py-1.5 text-xs font-semibold"
                  @click="showNewTemplateForm = true"
                >
                  <Plus class="size-3.5" />
                  New Template
                </button>
              </div>

              <!-- New template form -->
              <div v-if="showNewTemplateForm" class="ui-panel-muted ui-email-modal-template-form">
                <h4 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Create Template</h4>
                <input
                  v-model="newTemplateName"
                  type="text"
                  placeholder="Template name"
                  class="ui-field py-2"
                />
                <input
                  v-model="newTemplateSubject"
                  type="text"
                  placeholder="Subject line (use {{variables}})"
                  class="ui-field py-2"
                />
                <textarea
                  v-model="newTemplateBody"
                  rows="6"
                  placeholder="Email body (use {{variables}} for dynamic content)"
                  class="ui-field py-2 resize-none font-mono"
                />
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="ui-button ui-button-secondary px-3 py-1.5 text-xs"
                    @click="showNewTemplateForm = false"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    :disabled="isSavingTemplate"
                    class="ui-button ui-button-primary px-3 py-1.5 text-xs font-semibold"
                    @click="handleSaveTemplate"
                  >
                    <Save class="size-3" />
                    {{ isSavingTemplate ? 'Saving…' : 'Save Template' }}
                  </button>
                </div>
              </div>

              <!-- Existing custom templates -->
              <div v-if="templates && templates.length > 0" class="space-y-2">
                <h4 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Your Templates</h4>
                <div
                  v-for="t in templates"
                  :key="t.id"
                  class="ui-panel ui-list-row ui-email-modal-template-row"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-surface-800 dark:text-surface-200 truncate">{{ t.name }}</p>
                    <p class="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">{{ t.subject }}</p>
                  </div>
                  <button
                    type="button"
                    class="ui-button ui-button-ghost ui-button-ghost-danger shrink-0 ml-3 p-1.5"
                    @click="handleDeleteTemplate(t.id)"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>

              <div v-else-if="!showNewTemplateForm" class="text-center py-6">
                <p class="text-sm text-surface-400 dark:text-surface-500">No custom templates yet.</p>
                <p class="text-xs text-surface-400 dark:text-surface-500 mt-1">Create one to reuse across interview invitations.</p>
              </div>

              <!-- Variable reference -->
              <div class="ui-panel-muted ui-email-modal-variable-panel">
                <p class="text-[10px] uppercase tracking-wider font-semibold text-surface-400 mb-2">Available Variables</p>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="v in AVAILABLE_VARIABLES"
                    :key="v.key"
                    class="ui-code inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                    :title="v.desc"
                  >
                    {{ v.key }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div v-if="activeTab !== 'manage'" class="ui-panel-footer ui-email-modal-footer">
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="ui-button ui-button-secondary flex-1"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="button"
                :disabled="!canSend || isSending"
                class="ui-button ui-button-primary flex-1 font-semibold"
                @click="handleSend"
              >
                <Send class="size-4" />
                {{ isSending ? 'Sending…' : 'Send Invitation' }}
              </button>
            </div>
          </div>
        </template>
    </AppModalPanel>
  </AppModalShell>
</template>
