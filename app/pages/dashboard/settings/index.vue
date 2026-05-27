<script setup lang="ts">
import { Building2, Save, AlertTriangle, Trash2, Loader2, CircleHelp } from 'lucide-vue-next'
import { SALARY_UNIT_OPTIONS } from '~~/shared/salary-options'

definePageMeta({})

useSeoMeta({
  title: 'Organization Settings — Factory Careers',
  description: 'Manage your organization settings',
})

const { activeOrg } = useCurrentOrg()
const { allowed: canUpdateOrg, isLoading: isUpdateOrgPermissionLoading } = usePermission({ organization: ['update'] })
const { allowed: canDeleteOrg } = usePermission({ organization: ['delete'] })
const { defaultSalaryUnit, updateSettings } = useOrgSettings()
const { track } = useTrack()
const toast = useToast()
const config = useRuntimeConfig()
const factoryOrgName = computed(() => String(config.public.factoryOrgName || 'Factory').trim())
const factoryOrgSlug = computed(() => String(config.public.factoryOrgSlug || 'factory').trim().toLowerCase())
const isFactorySlugLocked = computed(() => !!factoryOrgSlug.value)
const siteUrl = computed(() => String(config.public.factoryCareersUrl || 'https://careers.thefactoryhq.com').replace(/\/+$/, ''))
const publicBoardPath = 'jobs'
const publicBoardPrefix = computed(() => {
  try {
    return `${new URL(siteUrl.value).host}/`
  }
  catch {
    return `${siteUrl.value.replace(/^https?:\/\//, '')}/`
  }
})
const publicBoardDisplayUrl = computed(() => `${publicBoardPrefix.value}${publicBoardPath}`)

// ─────────────────────────────────────────────
// Org name/slug editing
// ─────────────────────────────────────────────
const orgName = ref(factoryOrgName.value)
const orgSlug = ref(factoryOrgSlug.value)
const localDefaultSalaryUnit = ref<'YEAR' | 'MONTH' | 'HOUR'>('YEAR')
const isSaving = ref(false)

/** Slug must be lowercase alphanumeric + hyphens, 2-48 chars, no leading/trailing hyphen */
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

const slugError = computed(() => {
  if (isFactorySlugLocked.value) return ''
  const s = orgSlug.value.trim()
  if (!s) return ''
  if (!slugPattern.test(s)) return 'Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.'
  return ''
})

watch(activeOrg, (org) => {
  if (org) {
    orgName.value = org.name ?? ''
    orgSlug.value = isFactorySlugLocked.value ? factoryOrgSlug.value : (org.slug ?? '')
  }
}, { immediate: true })

watch(defaultSalaryUnit, (unit) => {
  localDefaultSalaryUnit.value = unit as 'YEAR' | 'MONTH' | 'HOUR'
}, { immediate: true })

async function handleSaveOrg() {
  if (!canUpdateOrg.value) return

  const trimmedName = orgName.value.trim()
  const trimmedSlug = isFactorySlugLocked.value ? factoryOrgSlug.value : orgSlug.value.trim().toLowerCase()

  // Prevent saving empty or invalid values
  if (!trimmedName) {
    toast.error('Organization name required', { message: 'Organization name cannot be empty.' })
    return
  }
  if (!trimmedSlug || slugError.value) {
    toast.error('Invalid organization slug', { message: slugError.value || 'Organization slug cannot be empty.' })
    return
  }
  isSaving.value = true

  try {
    await authClient.organization.update({
      data: {
        name: trimmedName,
        ...(isFactorySlugLocked.value ? {} : { slug: trimmedSlug }),
      },
    })
    await updateSettings({
      defaultSalaryUnit: localDefaultSalaryUnit.value,
    })
    track('org_settings_saved')
    toast.success('Organization settings saved')
  }
  catch (err: unknown) {
    toast.error('Failed to update organization', { message: err instanceof Error ? err.message : undefined })
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

const canConfirmDelete = computed(() => {
  const name = activeOrg.value?.name
  return !!name && deleteConfirmText.value === name
})

async function handleDeleteOrg() {
  if (!canDeleteOrg.value || !canConfirmDelete.value) return
  isDeleting.value = true

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
    toast.error('Failed to delete organization', { message: err instanceof Error ? err.message : undefined })
  }
  finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="ui-settings-page">
    <!-- Page title -->
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        General
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        Manage your organization's profile and configuration.
      </p>
    </div>

    <!-- Organization profile -->
    <section class="ui-panel ui-settings-panel factory-org-profile-panel">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <Building2 class="size-6 text-brand-400 shrink-0" />
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Organization profile</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Basic information about your organization.</p>
          </div>
        </div>
      </div>

      <div class="ui-settings-panel-body space-y-5">
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
          <div class="mb-1.5 flex items-center gap-1.5">
            <label for="public-board-path" class="text-sm font-medium text-surface-700 dark:text-surface-300">
              Public board URL
            </label>
            <span class="group relative inline-flex">
              <button
                type="button"
                class="inline-flex size-5 cursor-help items-center justify-center text-surface-500 transition-colors hover:text-brand-400 focus:outline-none focus-visible:text-brand-400"
                aria-label="Public board URL help"
                aria-describedby="public-board-url-tooltip"
              >
                <CircleHelp class="size-3.5" />
              </button>
              <span
                id="public-board-url-tooltip"
                role="tooltip"
                class="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 border border-white/14 bg-black px-3 py-2 text-xs leading-relaxed text-white/78 opacity-0 shadow-xl shadow-black/30 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Candidates see open roles at {{ publicBoardDisplayUrl }}. Individual roles use /jobs/:job-slug.
              </span>
            </span>
          </div>
          <div class="ui-field flex items-center overflow-hidden p-0 focus-within:border-brand-500">
            <span class="shrink-0 border-r border-surface-200 dark:border-surface-700 px-3 py-2 text-sm text-surface-500 dark:text-surface-400">
              {{ publicBoardPrefix }}
            </span>
            <input
              id="public-board-path"
              :value="publicBoardPath"
              type="text"
              readonly
              class="flex-1 bg-transparent px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none"
              aria-describedby="public-board-url-tooltip"
            />
          </div>
        </div>

        <div>
          <label for="org-default-salary-unit" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Default pay period
          </label>
          <FactorySelect
            id="org-default-salary-unit"
            v-model="localDefaultSalaryUnit"
            :options="SALARY_UNIT_OPTIONS"
            :disabled="!canUpdateOrg"
          />
          <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">
            New and unconfigured jobs use this pay period until a job-specific value is saved.
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

        </div>

      </div>
    </section>

    <!-- Danger zone -->
    <section v-if="canDeleteOrg" class="ui-panel ui-settings-panel mt-8">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <AlertTriangle class="size-6 text-danger-400 shrink-0" />
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Danger zone</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Irreversible and destructive actions.</p>
          </div>
        </div>
      </div>

      <div class="ui-settings-panel-body">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Delete organization</h3>
            <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              Permanently delete this organization and all its data. This action cannot be undone.
            </p>
          </div>
          <button
            class="ui-button ui-button-danger-outline shrink-0 px-3.5 py-2"
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
          </div>
        </Transition>
      </div>
    </section>

    <!-- Read-only notice for non-admin users -->
    <div v-if="!isUpdateOrgPermissionLoading && !canUpdateOrg" class="ui-alert ui-alert-info mt-6">
      You don't have permission to modify organization settings. Contact an admin or owner for changes.
    </div>
  </div>
</template>
