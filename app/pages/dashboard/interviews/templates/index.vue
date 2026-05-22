<script setup lang="ts">
import {
  ArrowLeft, Plus, Mail, Trash2, Sparkles, Lock,
  FileText, ChevronRight,
} from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Email Templates — Factory Careers',
  description: 'Manage interview invitation email templates',
  robots: 'noindex, nofollow',
})

const localePath = useLocalePath()

const { templates, status: fetchStatus, deleteTemplate } = useEmailTemplates()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()

const deletingId = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const templateToDelete = ref<{ id: string; name: string } | null>(null)

function confirmDelete(id: string, name: string) {
  templateToDelete.value = { id, name }
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!templateToDelete.value) return
  deletingId.value = templateToDelete.value.id
  try {
    await deleteTemplate(templateToDelete.value.id)
  } catch (err: any) {
    handlePreviewReadOnlyError(err)
  } finally {
    deletingId.value = null
    showDeleteConfirm.value = false
    templateToDelete.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <!-- Back to interviews -->
    <NuxtLink
      :to="localePath('/dashboard/interviews')"
      class="ui-button ui-button-secondary mb-6 rounded-full px-3 py-1.5 text-sm no-underline"
    >
      <ArrowLeft class="size-4" />
      Back to Interviews
    </NuxtLink>

    <!-- Page header -->
    <div class="mb-8 flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10">
            <Mail class="size-5" />
          </div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">
            Email Templates
          </h1>
        </div>
        <p class="text-sm text-surface-500 dark:text-surface-400 max-w-xl">
          Manage reusable email templates for interview invitations. Use built-in templates or create your own with dynamic variables.
        </p>
      </div>
      <NuxtLink
        :to="localePath('/dashboard/interviews/templates/new')"
        class="ui-button ui-button-primary shrink-0 px-4 py-2.5 text-sm font-semibold no-underline"
      >
        <Plus class="size-4" />
        New Template
      </NuxtLink>
    </div>

    <!-- Built-in templates section -->
    <section class="mb-10">
      <div class="flex items-center gap-2 mb-4">
        <Sparkles class="size-4 text-brand-500" />
        <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
          Built-in Templates
        </h2>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="t in SYSTEM_TEMPLATES"
          :key="t.id"
          :to="localePath(`/dashboard/interviews/templates/${t.id}`)"
          class="ui-panel-brand ui-list-row group relative p-5 no-underline"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-9">
              <FileText class="size-4" />
            </div>
            <span class="ui-pill text-[10px] uppercase tracking-wider">
              <Lock class="size-2.5" />
              Built-in
            </span>
          </div>
          <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-1 group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors">
            {{ t.name }}
          </h3>
          <p class="text-xs text-surface-500 dark:text-surface-400 line-clamp-2 mb-3">
            {{ t.description }}
          </p>
          <p class="text-[11px] font-mono text-surface-400 dark:text-surface-500 truncate">
            {{ t.subject }}
          </p>
          <ChevronRight class="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-surface-300 dark:text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </NuxtLink>
      </div>
    </section>

    <!-- Custom templates section -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <FileText class="size-4 text-surface-400" />
          <h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
            Your Templates
          </h2>
          <span
            v-if="templates && templates.length > 0"
            class="ui-pill ml-1 px-2 py-0.5 text-[11px] font-semibold"
          >
            {{ templates.length }}
          </span>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="fetchStatus === 'pending'" class="ui-panel flex items-center gap-3 p-8 justify-center">
        <div class="ui-spinner-brand size-5 rounded-full border-2 animate-spin" />
        <span class="text-sm text-surface-400">Loading templates…</span>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!templates || templates.length === 0"
        class="ui-empty-panel ui-empty-panel-dashed p-10"
      >
        <div class="ui-icon-state mx-auto mb-4 size-12">
          <Mail class="size-5" />
        </div>
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">
          No custom templates yet
        </h3>
        <p class="text-xs text-surface-400 dark:text-surface-500 mb-4 max-w-sm mx-auto">
          Create your own email templates to match your organization's voice and branding.
        </p>
        <NuxtLink
          :to="localePath('/dashboard/interviews/templates/new')"
          class="ui-button ui-button-primary no-underline"
        >
          <Plus class="size-4" />
          Create Your First Template
        </NuxtLink>
      </div>

      <!-- Template cards -->
      <div v-else class="space-y-3">
        <div
          v-for="t in templates"
          :key="t.id"
          class="ui-panel ui-list-row group relative"
        >
          <NuxtLink
            :to="localePath(`/dashboard/interviews/templates/${t.id}`)"
            class="block p-5 pr-24 no-underline"
          >
            <div class="flex items-start gap-4">
              <div class="ui-icon-state ui-icon-tile size-10">
                <FileText class="size-4.5" />
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-0.5 group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors">
                  {{ t.name }}
                </h3>
                <p class="text-[11px] font-mono text-surface-400 dark:text-surface-500 truncate mb-1.5">
                  {{ t.subject }}
                </p>
                <p class="text-xs text-surface-400 dark:text-surface-500">
                  Updated {{ new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                </p>
              </div>
            </div>
          </NuxtLink>

          <!-- Actions -->
          <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              class="ui-button ui-button-ghost ui-button-ghost-danger p-2 opacity-0 group-hover:opacity-100"
              title="Delete template"
              @click.stop.prevent="confirmDelete(t.id, t.name)"
            >
              <Trash2 class="size-4" />
            </button>
            <ChevronRight class="size-4 text-surface-300 dark:text-surface-600" />
          </div>
        </div>
      </div>
    </section>

    <!-- Delete confirmation (inline, not modal, using a bottom sheet style) -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div class="ui-modal-backdrop absolute inset-0" @click="showDeleteConfirm = false" />
          <div class="ui-modal-panel relative w-full max-w-sm mx-4 mb-4 sm:mb-0 p-6">
            <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-2">Delete Template</h3>
            <p class="text-sm text-surface-600 dark:text-surface-400 mb-5">
              Are you sure you want to delete <strong>{{ templateToDelete?.name }}</strong>? This cannot be undone.
            </p>
            <div class="flex gap-3">
              <button
                class="ui-button ui-button-secondary flex-1 px-4 py-2.5"
                @click="showDeleteConfirm = false"
              >
                Cancel
              </button>
              <button
                :disabled="deletingId !== null"
                class="ui-button ui-button-danger flex-1 px-4 py-2.5"
                @click="handleDelete"
              >
                {{ deletingId ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
