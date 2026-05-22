<script setup lang="ts">
import { Building2, Save, AlertTriangle, Trash2, Loader2 } from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Organization Settings — Factory Careers',
  description: 'Manage your organization settings',
})

const { activeOrg } = useCurrentOrg()
const { allowed: canUpdateOrg } = usePermission({ organization: ['update'] })
const { allowed: canDeleteOrg } = usePermission({ organization: ['delete'] })
const { track } = useTrack()

// ─────────────────────────────────────────────
// Org name/slug editing
// ─────────────────────────────────────────────
const orgName = ref('')
const orgSlug = ref('')
const isSaving = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

/** Slug must be lowercase alphanumeric + hyphens, 2-48 chars, no leading/trailing hyphen */
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

const slugError = computed(() => {
  const s = orgSlug.value.trim()
  if (!s) return ''
  if (!slugPattern.test(s)) return 'Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.'
  return ''
})

watch(activeOrg, (org) => {
  if (org) {
    orgName.value = org.name ?? ''
    orgSlug.value = org.slug ?? ''
  }
}, { immediate: true })

async function handleSaveOrg() {
  if (!canUpdateOrg.value) return

  const trimmedName = orgName.value.trim()
  const trimmedSlug = orgSlug.value.trim().toLowerCase()

  // Prevent saving empty or invalid values
  if (!trimmedName) {
    saveError.value = 'Organization name cannot be empty.'
    return
  }
  if (!trimmedSlug || slugError.value) {
    saveError.value = slugError.value || 'URL slug cannot be empty.'
    return
  }

  isSaving.value = true
  saveError.value = ''
  saveSuccess.value = false

  try {
    await authClient.organization.update({
      data: {
        name: trimmedName,
        slug: trimmedSlug,
      },
    })
    track('org_settings_saved')
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  }
  catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : 'Failed to update organization'
  }
  finally {
    isSaving.value = false
  }
}

// ─────────────────────────────────────────────
// Delete org
// ─────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deleteConfirmText = ref('')
const isDeleting = ref(false)
const deleteError = ref('')

const canConfirmDelete = computed(() => {
  const name = activeOrg.value?.name
  return !!name && deleteConfirmText.value === name
})

async function handleDeleteOrg() {
  if (!canDeleteOrg.value || !canConfirmDelete.value) return
  isDeleting.value = true
  deleteError.value = ''

  try {
    track('org_deleted')
    await authClient.organization.delete({
      organizationId: activeOrg.value!.id,
    })
    // Use navigateTo for Nuxt-managed navigation, then force reload
    // so all cached org state is cleared.
    const localePath = useLocalePath()
    await navigateTo(localePath('/onboarding/create-org'), { external: true })
  }
  catch (err: unknown) {
    deleteError.value = err instanceof Error ? err.message : 'Failed to delete organization'
  }
  finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <!-- Page title -->
    <div class="mb-6">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        General
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        Manage your organization's profile and configuration.
      </p>
    </div>

    <!-- Organization profile -->
    <section class="ui-panel ui-dashboard-panel overflow-hidden">
      <div class="ui-panel-header ui-dashboard-panel-header px-4 sm:px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-dashboard-soft-icon ui-icon-state-brand ui-icon-tile size-10 shrink-0">
            <Building2 class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Organization profile</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Basic information about your organization.</p>
          </div>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-5 space-y-5">
        <div>
          <label for="org-name" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Organization name
          </label>
          <input
            id="org-name"
            v-model="orgName"
            type="text"
            :disabled="!canUpdateOrg"
            class="ui-field disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="My Company"
          />
        </div>

        <div>
          <label for="org-slug" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            URL slug
          </label>
          <div class="ui-field flex items-center overflow-hidden p-0">
            <span class="ui-field-addon text-sm">
              careers.thefactoryhq.com/
            </span>
            <input
              id="org-slug"
              v-model="orgSlug"
              type="text"
              :disabled="!canUpdateOrg"
              class="ui-field-control flex-1 px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="my-company"
            />
          </div>
          <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">
            Used in your public job board URL. Only lowercase letters, numbers, and hyphens.
          </p>
          <p v-if="slugError" class="ui-feedback-danger mt-1 text-xs">
            {{ slugError }}
          </p>
        </div>

        <!-- Save button & feedback -->
        <div class="flex items-center gap-3 pt-2">
          <button
            :disabled="!canUpdateOrg || isSaving"
            class="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleSaveOrg"
          >
            <Loader2 v-if="isSaving" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            {{ isSaving ? 'Saving…' : 'Save changes' }}
          </button>

          <Transition
            enter-active-class="transition-opacity duration-300"
            leave-active-class="transition-opacity duration-300"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <span v-if="saveSuccess" class="ui-feedback-success text-sm">
              Changes saved
            </span>
          </Transition>
        </div>

        <div v-if="saveError" class="ui-alert ui-alert-danger">
          {{ saveError }}
        </div>
      </div>
    </section>

    <!-- Danger zone -->
    <section v-if="canDeleteOrg" class="ui-panel ui-dashboard-panel ui-panel-danger mt-8 overflow-hidden">
      <div class="ui-panel-header ui-dashboard-panel-header px-4 sm:px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-dashboard-soft-icon ui-icon-state-danger ui-icon-tile size-10 shrink-0">
            <AlertTriangle class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Danger zone</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Irreversible and destructive actions.</p>
          </div>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-5">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Delete organization</h3>
            <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              Permanently delete this organization and all its data. This action cannot be undone.
            </p>
          </div>
          <button
            class="ui-button ui-button-danger shrink-0 px-3.5 py-2"
            @click="showDeleteConfirm = true"
          >
            <Trash2 class="size-4" />
            Delete
          </button>
        </div>

        <!-- Delete confirmation -->
        <Transition
          enter-active-class="transition-all duration-200"
          leave-active-class="transition-all duration-200"
          enter-from-class="opacity-0 -translate-y-2"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div v-if="showDeleteConfirm" class="ui-alert ui-alert-danger mt-5 space-y-3">
            <p class="text-sm text-surface-700 dark:text-surface-300">
              Type <strong class="text-surface-900 dark:text-surface-100 font-semibold">{{ activeOrg?.name }}</strong> to confirm deletion:
            </p>
            <input
              v-model="deleteConfirmText"
              type="text"
              class="ui-field"
              :placeholder="activeOrg?.name"
            />
            <div class="flex items-center gap-2">
              <button
                :disabled="!canConfirmDelete || isDeleting"
                class="ui-button ui-button-danger disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleDeleteOrg"
              >
                <Loader2 v-if="isDeleting" class="size-4 animate-spin" />
                <Trash2 v-else class="size-4" />
                {{ isDeleting ? 'Deleting…' : 'Permanently delete' }}
              </button>
              <button
                class="ui-button ui-button-secondary"
                @click="showDeleteConfirm = false; deleteConfirmText = ''"
              >
                Cancel
              </button>
            </div>
            <div v-if="deleteError" class="ui-alert ui-alert-danger">
              {{ deleteError }}
            </div>
          </div>
        </Transition>
      </div>
    </section>

    <!-- Read-only notice for non-admin users -->
    <div v-if="!canUpdateOrg" class="ui-alert ui-alert-info mt-6">
      You don't have permission to modify organization settings. Contact an admin or owner for changes.
    </div>
  </div>
</template>
