<script setup lang="ts">
import {
  Save, Eye, EyeOff, Copy, Trash2, Lock,
  FileText, Mail,
} from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const templateId = route.params.id as string
const toast = useToast()
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

async function handleSave() {
  if (isSystemTemplate.value) return
  if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
    toast.error('All fields are required')
    return
  }

  isSaving.value = true
  try {
    await updateTemplate(templateId, {
      name: form.name.trim(),
      subject: form.subject.trim(),
      body: form.body.trim(),
    })
    toast.success('Template saved')
    hasLoaded.value = false // Re-sync
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save template', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
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
    toast.error('Failed to duplicate template', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
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
    toast.error('Failed to delete template', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
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
  <div class="mx-auto max-w-5xl px-6 py-8">
    <!-- Breadcrumb -->
    <AppBackLink
      :to="localePath('/dashboard/interviews/templates')"
      class="mb-6"
    >
      All Templates
    </AppBackLink>

    <!-- Not found -->
    <div v-if="notFound" class="ui-alert-danger p-8 text-center">
      <p class="text-sm text-danger-700 dark:text-danger-300 mb-2 font-semibold">Template not found</p>
      <p class="text-xs text-danger-600 dark:text-danger-400 mb-4">This template may have been deleted or doesn't exist.</p>
      <NuxtLink
        :to="localePath('/dashboard/interviews/templates')"
        class="ui-inline-link-brand px-4 py-2 text-sm font-semibold no-underline"
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
            class="ui-icon-tile size-11 shrink-0 rounded-xl"
            :class="isSystemTemplate
              ? 'bg-gradient-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/20'
              : 'bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-700 dark:to-surface-600'"
          >
            <FileText class="size-5 text-white" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h1 class="text-xl font-bold text-surface-900 dark:text-surface-50 truncate tracking-tight">
                {{ form.name }}
              </h1>
              <span
                v-if="isSystemTemplate"
                class="ui-pill text-[10px] uppercase tracking-wider font-semibold text-surface-400"
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
            class="ui-button ui-button-secondary cursor-pointer inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all"
            @click="showPreview = !showPreview"
          >
            <component :is="showPreview ? EyeOff : Eye" class="size-4" />
            {{ showPreview ? 'Hide Preview' : 'Preview' }}
          </button>
          <button
            v-if="isSystemTemplate"
            :disabled="isDuplicating"
            class="ui-button ui-button-primary cursor-pointer inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            @click="handleDuplicate"
          >
            <Copy class="size-4" />
            {{ isDuplicating ? 'Duplicating…' : 'Duplicate as Custom' }}
          </button>
          <template v-else>
            <button
              :disabled="!isDirty || isSaving"
              class="ui-button ui-button-primary cursor-pointer inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              @click="handleSave"
            >
              <Save class="size-4" />
              {{ isSaving ? 'Saving…' : 'Save Changes' }}
            </button>
          </template>
        </div>
      </div>

      <div class="grid gap-6" :class="showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-[1fr_320px]'">
        <!-- Editor panel -->
        <div class="space-y-5">
          <!-- Name -->
          <div class="ui-panel p-5">
            <label for="template-name" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">
              Template Name
            </label>
            <input
              id="template-name"
              v-model="form.name"
              type="text"
              :disabled="isSystemTemplate"
              placeholder="e.g., Welcome Interview"
              class="ui-field px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <!-- Subject -->
          <div class="ui-panel p-5">
            <label for="template-subject" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">
              Subject Line
            </label>
            <input
              id="template-subject"
              v-model="form.subject"
              type="text"
              :disabled="isSystemTemplate"
              placeholder="e.g., Interview Invitation: {{jobTitle}}"
              class="ui-field px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none transition-all font-mono text-[13px] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <!-- Body -->
          <div class="ui-panel p-5">
            <label for="template-body" class="block text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">
              Email Body
            </label>
            <textarea
              id="template-body"
              v-model="form.body"
              :disabled="isSystemTemplate"
              rows="18"
              placeholder="Write your invitation email here. Use {{variables}} for dynamic content…"
              class="ui-field px-3.5 py-2.5 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none transition-all resize-none font-mono text-[13px] leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <!-- Delete zone (custom templates only) -->
          <div v-if="!isSystemTemplate" class="ui-panel-danger p-5">
            <h3 class="text-sm font-semibold text-danger-700 dark:text-danger-400 mb-1">Danger Zone</h3>
            <p class="text-xs text-danger-600/80 dark:text-danger-400/60 mb-3">Permanently delete this template. This action cannot be undone.</p>
            <button
              :disabled="isDeleting"
              class="ui-button ui-button-danger cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <div v-if="showPreview" class="ui-panel-brand overflow-hidden">
              <div class="ui-panel-brand-header px-5 py-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Mail class="size-4 text-brand-500 dark:text-brand-400" />
                    <span class="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Live Preview</span>
                  </div>
                  <button type="button" class="ui-button ui-button-ghost p-1 rounded" @click="showPreview = false">
                    <EyeOff class="size-3.5 text-surface-400" />
                  </button>
                </div>
              </div>
              <div class="p-5 space-y-4">
                <div v-if="!form.subject && !form.body" class="py-4 text-center">
                  <div class="ui-icon-state mx-auto mb-3 flex size-10">
                    <Mail class="size-5 text-surface-400" />
                  </div>
                  <p class="text-xs text-surface-400">Start typing to see a preview</p>
                </div>
                <template v-else>
                <div>
                  <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400 block mb-1">Subject</span>
                  <p class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ previewSubject }}</p>
                </div>
                <div class="ui-panel-divider pt-4">
                  <span class="text-[10px] uppercase tracking-wider font-semibold text-surface-400 block mb-2">Body</span>
                  <div class="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap leading-relaxed">{{ previewBody }}</div>
                </div>
                </template>
              </div>
              <div class="ui-panel-muted border-t px-5 py-2.5">
                <p class="text-[11px] text-surface-400 dark:text-surface-500 italic">
                  Preview uses sample data. Actual values are populated when sending.
                </p>
              </div>
            </div>
          </Transition>

          <!-- Variable reference -->
          <div class="ui-panel p-5">
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
                class="flex items-center justify-between rounded-lg bg-surface-50 dark:bg-surface-800/50 px-3 py-2"
              >
                <code class="ui-code text-[11px] font-mono select-all">{{ v.key }}</code>
                <span class="text-[11px] text-surface-400 dark:text-surface-500">{{ v.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Loading -->
    <div v-else class="flex items-center justify-center py-20">
      <div class="ui-spinner-brand size-8 animate-spin" />
    </div>
  </div>
</template>
