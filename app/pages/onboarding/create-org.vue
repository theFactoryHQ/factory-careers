<script setup lang="ts">
import { Building2, UserPlus, Search, Loader2, Check, Link2, MessageSquare } from 'lucide-vue-next'

definePageMeta({
  layout: 'auth',
  middleware: ['auth'],
})

useSeoMeta({
  title: 'Join Factory — Factory Careers',
  description: 'Join the Factory Careers workspace',
  robots: 'noindex, nofollow',
})

const { orgs, isOrgsLoading, switchOrg, createOrg, activeOrg } = useCurrentOrg()
const { acceptInviteLink } = useInviteLinks()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { track } = useTrack()

onMounted(() => track('onboarding_viewed', { mode: viewMode.value }))

const orgName = ref('')
const slug = ref('')
const slugEdited = ref(false)
const error = ref('')
const isLoading = ref(false)
const showCreateForm = ref(false)
const publicOrgCreationEnabled = computed(
  () => config.public.factoryPublicOrgCreationEnabled === true,
)

// ─────────────────────────────────────────────
// View mode: 'picker' | 'create' | 'join'
// ─────────────────────────────────────────────
const viewMode = ref<'picker' | 'create' | 'join'>('picker')

// ─────────────────────────────────────────────
// Auto-switch: if user already belongs to exactly one org, activate it
// ─────────────────────────────────────────────
const autoSwitched = ref(false)

watch([orgs, isOrgsLoading], async ([orgList, loading]) => {
  if (loading || autoSwitched.value || viewMode.value !== 'picker') return
  if (orgList.length === 1 && !activeOrg.value) {
    const firstOrg = orgList[0]
    if (!firstOrg) return

    autoSwitched.value = true
    isLoading.value = true
    try {
      await switchOrg(firstOrg.id)
    }
    catch {
      isLoading.value = false
      autoSwitched.value = false
    }
  }
}, { immediate: true })

async function handleSwitchOrg(orgId: string) {
  isLoading.value = true
  try {
    await switchOrg(orgId)
  }
  catch {
    isLoading.value = false
  }
}

/** Auto-generate slug from org name unless user has manually edited it */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

watch(orgName, (newName) => {
  if (!slugEdited.value) {
    slug.value = generateSlug(newName)
  }
})

function onSlugInput() {
  slugEdited.value = true
}

async function handleCreateOrg() {
  error.value = ''

  if (!publicOrgCreationEnabled.value) {
    error.value = 'Factory Careers uses a single Factory organization. Ask an administrator for an invitation.'
    return
  }

  if (!orgName.value.trim()) {
    error.value = 'Organization name is required.'
    return
  }

  if (!slug.value.trim()) {
    error.value = 'Slug is required.'
    return
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug.value)) {
    error.value = 'Slug must be lowercase alphanumeric with hyphens, and cannot start or end with a hyphen.'
    return
  }

  isLoading.value = true

  try {
    // Track before createOrg() because it triggers window.location.href navigation
    // which unloads the page — any code after await would never execute.
    track('org_created')
    await createOrg({ name: orgName.value.trim(), slug: slug.value.trim() })
  }
  catch (err: any) {
    error.value = err?.message ?? 'Failed to create organization. The slug may already be taken.'
    isLoading.value = false
  }
}

// ─────────────────────────────────────────────
// Join existing org — invite code
// ─────────────────────────────────────────────
const inviteCode = ref('')
const inviteCodeError = ref('')
const isAcceptingCode = ref(false)
const inviteCodeSuccess = ref(false)

/**
 * Extract the token from either a full URL or a raw code.
 * Handles:
 *   - Full URL: https://example.com/join/abc123def456...
 *   - Just the token: abc123def456...
 */
function extractToken(input: string): string {
  const trimmed = input.trim()
  // If it looks like a URL, extract the last path segment
  try {
    const url = new URL(trimmed)
    const segments = url.pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] || trimmed
  }
  catch {
    // Not a URL, treat as raw token
    return trimmed
  }
}

async function handleAcceptInviteCode() {
  inviteCodeError.value = ''
  const token = extractToken(inviteCode.value)

  if (!token) {
    inviteCodeError.value = 'Please enter an invite link or code.'
    return
  }

  isAcceptingCode.value = true

  try {
    const result = await acceptInviteLink(token)

    inviteCodeSuccess.value = true

    track('org_joined', { method: 'invite_code' })

    // Set the new org as active and navigate to dashboard
    await authClient.organization.setActive({
      organizationId: result.organizationId,
    })

    setTimeout(() => {
      window.location.href = localePath('/dashboard')
    }, 1500)
  }
  catch (err: any) {
    inviteCodeError.value = err?.data?.statusMessage || 'Invalid, expired, or already used invite link.'
  }
  finally {
    isAcceptingCode.value = false
  }
}

// ─────────────────────────────────────────────
// Join existing org — search & request
// ─────────────────────────────────────────────
const orgSearch = ref('')
const orgSearchResults = ref<Array<{ id: string; name: string; slug: string }>>([])
const isSearching = ref(false)
const searchError = ref('')
const joinRequestMessage = ref('')
const isSubmittingRequest = ref(false)
const requestSuccess = ref('')
const requestError = ref('')
const selectedOrg = ref<{ id: string; name: string; slug: string } | null>(null)

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

watch(orgSearch, (q) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  if (q.trim().length < 2) {
    orgSearchResults.value = []
    return
  }
  searchDebounceTimer = setTimeout(() => handleOrgSearch(), 300)
})

async function handleOrgSearch() {
  const q = orgSearch.value.trim()
  if (q.length < 2) return

  isSearching.value = true
  searchError.value = ''

  try {
    const data = await $fetch('/api/org-search', {
      params: { q },
    })
    orgSearchResults.value = data as typeof orgSearchResults.value
  }
  catch (err: any) {
    searchError.value = err?.data?.statusMessage || 'Search failed'
  }
  finally {
    isSearching.value = false
  }
}

async function handleSubmitJoinRequest() {
  if (!selectedOrg.value) return

  isSubmittingRequest.value = true
  requestError.value = ''
  requestSuccess.value = ''

  try {
    await $fetch('/api/join-requests', {
      method: 'POST',
      body: {
        organizationId: selectedOrg.value.id,
        message: joinRequestMessage.value.trim() || undefined,
      },
    })
    requestSuccess.value = `Join request sent to ${selectedOrg.value.name}! An admin will review it.`
    track('org_joined', { method: 'search_request' })
    selectedOrg.value = null
    joinRequestMessage.value = ''
  }
  catch (err: any) {
    requestError.value = err?.data?.statusMessage || 'Failed to send join request'
  }
  finally {
    isSubmittingRequest.value = false
  }
}
</script>

<template>
  <!-- Loading / auto-switching state -->
  <div v-if="isLoading || isOrgsLoading" class="flex flex-col items-center gap-3 py-8">
    <div class="size-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    <p class="text-sm text-surface-500 dark:text-surface-400">Setting up your workspace…</p>
  </div>

  <!-- Invite code accepted success -->
  <div v-else-if="inviteCodeSuccess" class="flex flex-col items-center gap-4 py-6">
    <div class="ui-icon-state ui-icon-state-success">
      <Check class="size-6" />
    </div>
    <div class="text-center">
      <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1">You're in!</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400">Redirecting to dashboard…</p>
    </div>
  </div>

  <!-- Org picker: user has orgs but none is active -->
  <div v-else-if="orgs.length > 0 && viewMode === 'picker'" class="flex flex-col gap-4">
    <h2 class="text-xl font-semibold text-center text-surface-900 dark:text-surface-100">Select an organization</h2>
    <p class="text-sm text-surface-500 dark:text-surface-400 text-center mb-2">
      Choose which workspace to open.
    </p>

    <button
      v-for="org in orgs"
      :key="org.id"
      class="ui-selectable-panel flex items-center gap-3 px-4 py-3 text-left text-sm"
      @click="handleSwitchOrg(org.id)"
    >
      <Building2 class="size-5 text-surface-400" />
      <div class="flex flex-col">
        <span class="font-medium">{{ org.name }}</span>
        <span class="text-xs text-surface-400">{{ org.slug }}</span>
      </div>
    </button>

    <div class="flex flex-col gap-2 mt-2 pt-2 border-t border-surface-200 dark:border-surface-800">
      <button
        v-if="publicOrgCreationEnabled"
        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
        @click="viewMode = 'create'"
      >
        Create a new organization
      </button>
      <button
        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
        @click="viewMode = 'join'"
      >
        Join an existing organization
      </button>
    </div>
  </div>

  <!-- Join existing org -->
  <div v-else-if="viewMode === 'join'" class="flex flex-col gap-5">
    <div class="text-center">
      <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100">Join an organization</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">
        Enter an invite link/code, or search for an organization to request access.
      </p>
    </div>

    <!-- Invite code input -->
    <div class="ui-panel p-4">
      <div class="flex items-center gap-2 mb-3">
        <Link2 class="size-4 text-brand-600 dark:text-brand-400" />
        <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Have an invite link?</h3>
      </div>
      <div class="flex gap-2">
        <input
          v-model="inviteCode"
          type="text"
          placeholder="Paste invite link or code"
          class="ui-field flex-1"
          @keydown.enter="handleAcceptInviteCode"
        />
        <button
          :disabled="isAcceptingCode || !inviteCode.trim()"
          class="ui-button ui-button-primary px-4 py-2"
          @click="handleAcceptInviteCode"
        >
          <Loader2 v-if="isAcceptingCode" class="size-4 animate-spin" />
          Join
        </button>
      </div>
      <div v-if="inviteCodeError" class="mt-2 text-xs text-danger-600 dark:text-danger-400">{{ inviteCodeError }}</div>
    </div>

    <!-- Divider -->
    <div class="flex items-center gap-3">
      <div class="flex-1 border-t border-surface-200 dark:border-surface-800" />
      <span class="text-xs text-surface-400 dark:text-surface-500">or</span>
      <div class="flex-1 border-t border-surface-200 dark:border-surface-800" />
    </div>

    <!-- Org search -->
    <div class="ui-panel p-4">
      <div class="flex items-center gap-2 mb-3">
        <Search class="size-4 text-brand-600 dark:text-brand-400" />
        <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Request to join</h3>
      </div>
      <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">
        Search by organization name or slug. An admin must approve your request.
      </p>

      <div class="relative">
        <input
          v-model="orgSearch"
          type="text"
          placeholder="Search organizations…"
          class="ui-field pl-9"
        />
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
        <Loader2 v-if="isSearching" class="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-surface-400" />
      </div>

      <div v-if="searchError" class="mt-2 text-xs text-danger-600 dark:text-danger-400">{{ searchError }}</div>

      <!-- Search results -->
      <div v-if="orgSearchResults.length > 0 && !selectedOrg" class="mt-2 border border-surface-200 dark:border-surface-700 rounded-md overflow-hidden">
        <button
          v-for="org in orgSearchResults"
          :key="org.id"
          class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm bg-transparent border-0 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors border-b border-surface-100 dark:border-surface-800 last:border-b-0"
          @click="selectedOrg = org"
        >
          <Building2 class="size-4 text-surface-400 flex-shrink-0" />
          <div>
            <div class="font-medium text-surface-900 dark:text-surface-100">{{ org.name }}</div>
            <div class="text-xs text-surface-400">{{ org.slug }}</div>
          </div>
        </button>
      </div>

      <div v-if="orgSearch.trim().length >= 2 && !isSearching && orgSearchResults.length === 0 && !selectedOrg" class="ui-empty-state mt-2 text-xs">
        No organizations found
      </div>

      <!-- Selected org — request form -->
      <div v-if="selectedOrg" class="ui-panel-muted ui-selectable-panel-active mt-3 p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <Building2 class="size-4 text-brand-600 dark:text-brand-400" />
            <span class="text-sm font-medium text-surface-900 dark:text-surface-100">{{ selectedOrg.name }}</span>
          </div>
          <button
            class="text-xs text-surface-400 hover:text-surface-600 transition-colors"
            @click="selectedOrg = null"
          >
            Change
          </button>
        </div>

        <label class="flex flex-col gap-1 text-xs text-surface-600 dark:text-surface-400">
          <span>Message (optional)</span>
          <textarea
            v-model="joinRequestMessage"
            placeholder="Tell the admin why you'd like to join…"
            rows="2"
            maxlength="500"
            class="ui-field resize-none"
          />
        </label>

        <button
          :disabled="isSubmittingRequest"
          class="ui-button ui-button-primary mt-2 w-full"
          @click="handleSubmitJoinRequest"
        >
          <Loader2 v-if="isSubmittingRequest" class="size-4 animate-spin" />
          <UserPlus v-else class="size-4" />
          {{ isSubmittingRequest ? 'Sending…' : 'Send join request' }}
        </button>
      </div>

      <div v-if="requestError" class="mt-2 text-xs text-danger-600 dark:text-danger-400">{{ requestError }}</div>

      <!-- Request success -->
      <div v-if="requestSuccess" class="ui-alert ui-alert-success mt-2 flex items-center gap-2 text-xs">
        <Check class="size-4 flex-shrink-0" />
        {{ requestSuccess }}
      </div>
    </div>

    <!-- Back links -->
    <div class="flex flex-col items-center gap-2">
      <button
        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
        @click="viewMode = orgs.length > 0 ? 'picker' : (publicOrgCreationEnabled ? 'create' : 'join')"
      >
        {{ orgs.length > 0 ? 'Back to organization list' : (publicOrgCreationEnabled ? 'Create a new organization instead' : 'Use an invite link instead') }}
      </button>
    </div>
  </div>

  <!-- Create org form -->
  <form v-else-if="publicOrgCreationEnabled" class="flex flex-col gap-4" @submit.prevent="handleCreateOrg">
    <h2 class="text-xl font-semibold text-center text-surface-900 dark:text-surface-100">Create your organization</h2>
    <p class="text-sm text-surface-500 dark:text-surface-400 text-center mb-2">
      Set up your workspace to start managing candidates and jobs.
    </p>

    <div v-if="error" class="ui-alert ui-alert-danger">{{ error }}</div>

    <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
      <span>Organization name</span>
      <input
        v-model="orgName"
        type="text"
        placeholder="Acme Corp"
        required
        class="ui-field"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
      <span>Slug</span>
      <input
        v-model="slug"
        type="text"
        placeholder="acme-corp"
        required
        class="ui-field"
        @input="onSlugInput"
      />
      <span class="text-xs font-normal text-surface-400">Used in URLs. Lowercase letters, numbers, and hyphens only.</span>
    </label>

    <button
      type="submit"
      :disabled="isLoading"
      class="ui-button ui-button-primary mt-2"
    >
      {{ isLoading ? 'Creating…' : 'Create organization' }}
    </button>

    <div class="flex flex-col items-center gap-2 mt-1">
      <button
        v-if="orgs.length > 0"
        type="button"
        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
        @click="viewMode = 'picker'"
      >
        Back to organization list
      </button>
      <button
        type="button"
        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
        @click="viewMode = 'join'"
      >
        Join an existing organization instead
      </button>
    </div>
  </form>

  <div v-else class="flex flex-col gap-5 text-center">
    <div>
      <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100">Join Factory Careers</h2>
      <p class="mt-2 text-sm leading-6 text-surface-500 dark:text-surface-400">
        This workspace is managed by Factory. Use an invite link or request access so an administrator can approve you.
      </p>
    </div>
    <button
<<<<<<< HEAD
      class="ui-button ui-button-primary"
=======
      class="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
      @click="viewMode = 'join'"
    >
      Enter invite or request access
    </button>
  </div>
</template>
