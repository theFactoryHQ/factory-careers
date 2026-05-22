<script setup lang="ts">
import {
  ArrowLeft, Save, Eye, EyeOff, Copy, Trash2, Lock,
  FileText, Mail, AlertCircle,
} from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const templateId = route.params.id as string
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

const isSystemTemplate = computed(() => templateId.startsWith('system-'))

// ─── System template lookup ──────────────────────────────────────
const systemTemplate = computed(() =>
  SYSTEM_TEMPLATES.find(t => t.id === templateId),
)

// ─── Custom template loading ─────────────────────────────────────
const { templates, updateTemplate, deleteTemplate, createTemplate } = useEmailTemplates()

const customTemplate = computed(() =>
  templates.value?.find(t => t.id === templateId),
)

const notFound = computed(() => {
  if (isSystemTemplate.value) return !systemTemplate.value
  return templates.value !== null && !customTemplate.value
})

// ─── Form state ──────────────────────────────────────────────────
const form = reactive({
  name: '',
  subject: '',
  body: '',
})

const hasLoaded = ref(false)
const isDirty = computed(() => {
  if (!hasLoaded.value) return false
  const source = isSystemTemplate.value ? systemTemplate.value : customTemplate.value
  if (!source) return false
  return form.name !== source.name || form.subject !== source.subject || form.body !== source.body
})

// Initialize form from template data
watchEffect(() => {
  const source = isSystemTemplate.value ? systemTemplate.value : customTemplate.value
  if (source && !hasLoaded.value) {
    form.name = source.name
    form.subject = source.subject
    form.body = source.body
    hasLoaded.value = true
  }
})

// ─── Save ────────────────────────────────────────────────────────
const isSaving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

async function handleSave() {
  if (isSystemTemplate.value) return
  saveError.value = ''
  if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
    saveError.value = 'All fields are required'
    return
  }

  isSaving.value = true
  try {
    await updateTemplate(templateId, {
      name: form.name.trim(),
      subject: form.subject.trim(),
      body: form.body.trim(),
    })
    saveSuccess.value = true
    hasLoaded.value = false // Re-sync
    setTimeout(() => { saveSuccess.value = false }, 2000)
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    saveError.value = err?.data?.statusMessage ?? 'Failed to save template'
  } finally {
    isSaving.value = false
  }
}

// ─── Duplicate system template ───────────────────────────────────
const isDuplicating = ref(false)

async function handleDuplicate() {
  isDuplicating.value = true
  try {
    const created = await createTemplate({
      name: `${form.name} (Copy)`,
      subject: form.subject,
      body: form.body,
    })
    await navigateTo(localePath(`/dashboard/interviews/templates/${(created as any).id}`))
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    saveError.value = err?.data?.statusMessage ?? 'Failed to duplicate template'
  } finally {
    isDuplicating.value = false
  }
}

// ─── Delete ──────────────────────────────────────────────────────
const isDeleting = ref(false)

async function handleDelete() {
  if (isSystemTemplate.value) return
  isDeleting.value = true
  try {
    await deleteTemplate(templateId)
    await navigateTo(localePath('/dashboard/interviews/templates'))
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    saveError.value = err?.data?.statusMessage ?? 'Failed to delete template'
  } finally {
    isDeleting.value = false
  }
}

// ─── Preview ─────────────────────────────────────────────────────
const showPreview = ref(false)

const sampleVariables: Record<string, string> = {
  candidateName: 'Alex Johnson',
  candidateFirstName: 'Alex',
  candidateLastName: 'Johnson',
  candidateEmail: 'alex@example.com',
  jobTitle: 'Senior Frontend Engineer',
  interviewTitle: 'Technical Interview — Round 2',
  interviewDate: 'Monday, March 16, 2026',
  interviewTime: '2:00 PM',
  interviewDuration: '60',
  interviewType: 'Video Call',
  interviewLocation: 'https://meet.google.com/abc-defg-hij',
  interviewers: 'Sarah Chen, Michael Park',
  organizationName: 'Acme Corp',
}

const previewSubject = computed(() => renderTemplatePreview(form.subject, sampleVariables))
const previewBody = computed(() => renderTemplatePreview(form.body, sampleVariables))

useSeoMeta({
  title: computed(() => form.name ? `${form.name} — Email Templates — Factory Careers` : 'Email Template — Factory Careers'),
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="ui-template-page">
    <!-- Breadcrumb -->
    <NuxtLink
      :to="localePath('/dashboard/interviews/templates')"
      class="ui-button ui-button-secondary ui-detail-back-link no-underline"
    >
      <ArrowLeft class="size-4" />
      All Templates
    </NuxtLink>

    <!-- Not found -->
    <div v-if="notFound" class="ui-alert ui-alert-danger p-8 text-center">
      <p class="text-sm text-danger-700 dark:text-danger-300 mb-2 font-semibold">Template not found</p>
      <p class="text-xs text-danger-600 dark:text-danger-400 mb-4">This template may have been deleted or doesn't exist.</p>
      <NuxtLink
        :to="localePath('/dashboard/interviews/templates')"
        class="ui-button ui-button-primary no-underline"
      >
        Back to Templates
      </NuxtLink>
    </div>

    <!-- Template editor -->
    <template v-else-if="hasLoaded">
      <!-- Page header -->
      <div class="mb-6 flex items-start justify-between gap-4">
        <div class="flex items-start gap-3 min-w-0">
          <div
            class="ui-icon-state ui-icon-tile size-11"
            :class="isSystemTemplate
              ? 'ui-icon-state-brand'
              : 'ui-dashboard-soft-icon'"
          >
            <FileText class="size-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50 truncate tracking-tight">
                {{ form.name }}
              </h1>
              <span
                v-if="isSystemTemplate"
                class="ui-pill px-2 py-0.5 text-[10px] uppercase tracking-wider"
              >
                <Lock class="size-2.5" />
                Built-in
              </span>
            </div>
            <p v-if="isSystemTemplate && systemTemplate" class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              {{ systemTemplate.description }}
            </p>
          </div>
        </div>

        <!-- Header actions -->
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="ui-button ui-button-ghost px-3.5 py-2"
            @click="showPreview = !showPreview"
          >
            <component :is="showPreview ? EyeOff : Eye" class="size-4" />
            {{ showPreview ? 'Hide Preview' : 'Preview' }}
          </button>
          <button
            v-if="isSystemTemplate"
            :disabled="isDuplicating"
            class="ui-button ui-button-primary px-4 py-2 font-semibold"
            @click="handleDuplicate"
          >
            <Copy class="size-4" />
            {{ isDuplicating ? 'Duplicating…' : 'Duplicate as Custom' }}
          </button>
          <template v-else>
            <button
              :disabled="!isDirty || isSaving"
              class="ui-button ui-button-primary px-4 py-2 font-semibold"
              @click="handleSave"
            >
              <Save class="size-4" />
              {{ isSaving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save Changes' }}
            </button>
          </template>
        </div>
      </div>

      <!-- Error -->
      <div v-if="saveError" class="ui-alert ui-alert-danger mb-6 flex items-start gap-2.5 p-4 text-sm">
        <AlertCircle class="size-4 shrink-0 mt-0.5" />
        {{ saveError }}
      </div>

      <div class="ui-template-builder-grid" :class="showPreview ? 'ui-template-builder-grid-even' : 'ui-template-builder-grid-sidebar'">
        <!-- Editor panel -->
        <div class="space-y-5">
          <!-- Name -->
          <div class="ui-panel ui-detail-card">
            <label for="template-name" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">
              Template Name
            </label>
            <input
              id="template-name"
              v-model="form.name"
              type="text"
              :disabled="isSystemTemplate"
              placeholder="e.g., Welcome Interview"
              class="ui-field px-3.5 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <!-- Subject -->
          <div class="ui-panel ui-detail-card">
            <label for="template-subject" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">
              Subject Line
            </label>
            <input
              id="template-subject"
              v-model="form.subject"
              type="text"
              :disabled="isSystemTemplate"
              placeholder="e.g., Interview Invitation: {{jobTitle}}"
              class="ui-field px-3.5 py-2.5 font-mono text-[13px] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <!-- Body -->
          <div class="ui-panel ui-detail-card">
            <label for="template-body" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">
              Email Body
            </label>
            <textarea
              id="template-body"
              v-model="form.body"
              :disabled="isSystemTemplate"
              rows="18"
              placeholder="Write your invitation email here. Use {{variables}} for dynamic content…"
              class="ui-field px-3.5 py-2.5 resize-none font-mono text-[13px] leading-relaxed disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <!-- Delete zone (custom templates only) -->
          <div v-if="!isSystemTemplate" class="ui-panel-danger ui-detail-danger-card">
            <h3 class="text-sm font-semibold text-danger-700 dark:text-danger-400 mb-1">Danger Zone</h3>
            <p class="text-xs text-danger-600/80 dark:text-danger-400/60 mb-3">Permanently delete this template. This action cannot be undone.</p>
            <button
              :disabled="isDeleting"
              class="ui-button ui-button-danger px-3 py-1.5"
              @click="handleDelete"
            >
              <Trash2 class="size-3.5" />
              {{ isDeleting ? 'Deleting…' : 'Delete Template' }}
            </button>
          </div>
        </div>

        <!-- Right panel: Preview or Variable reference -->
        <div class="space-y-5">
          <!-- Live preview (when toggled) -->
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-2"
          >
            <div v-if="showPreview" class="ui-panel-brand ui-template-preview-card">
              <div class="ui-panel-brand-header ui-detail-inline-panel-header">
                <div class="flex items-center gap-2">
                  <Mail class="ui-icon-brand size-4" />
                  <span class="ui-inline-link-brand text-xs font-semibold uppercase tracking-wider no-underline">Live Preview</span>
                </div>
              </div>
              <div class="ui-detail-inline-panel-body space-y-4">
                <div>
                  <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400 block mb-1">Subject</span>
                  <p class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ previewSubject }}</p>
                </div>
                <div class="ui-panel-divider pt-4">
                  <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400 block mb-2">Body</span>
                  <div class="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap leading-relaxed">{{ previewBody }}</div>
                </div>
              </div>
              <div class="ui-panel-footer ui-template-preview-footer">
                <p class="text-[11px] text-surface-400 dark:text-surface-500 italic">
                  Preview uses sample data. Actual values are populated when sending.
                </p>
              </div>
            </div>
          </Transition>

          <!-- Variable reference -->
          <div class="ui-panel ui-detail-card">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-3">
              Available Variables
            </h3>
            <p class="text-xs text-surface-400 dark:text-surface-500 mb-3">
              Use these placeholders in your subject and body. They'll be replaced with real data when the email is sent.
            </p>
            <div class="space-y-1.5">
              <div
                v-for="v in AVAILABLE_VARIABLES"
                :key="v.key"
                class="ui-panel-muted ui-template-variable-row"
              >
                <code class="ui-code select-all">{{ v.key }}</code>
                <span class="text-[11px] text-surface-400 dark:text-surface-500">{{ v.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Loading -->
    <div v-else class="flex items-center justify-center py-20">
      <div class="ui-spinner-brand size-8 rounded-full border-2 animate-spin" />
    </div>
  </div>
</template>
