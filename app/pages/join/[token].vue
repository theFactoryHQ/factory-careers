<script setup lang="ts">
import { Building2, UserPlus, Shield, ShieldCheck, Loader2, AlertTriangle, Check } from 'lucide-vue-next'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Join Organization — Factory Careers',
  description: 'Accept an invitation to join an organization on Factory Careers',
  robots: 'noindex, nofollow',
})

const route = useRoute()
const localePath = useLocalePath()
const { acceptInviteLink, fetchInviteLinkInfo } = useInviteLinks()
const token = computed(() => route.params.token as string)

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
const isLoading = ref(true)
const isAccepting = ref(false)
const error = ref('')
const success = ref(false)
const linkInfo = ref<{
  organizationName: string
  organizationSlug: string
  role: string
  invitedByName: string | null
  expiresAt: string
} | null>(null)

// Check authentication state
const { data: session } = await authClient.useSession(useFetch)
const isAuthenticated = computed(() => !!session.value?.user)

// ─────────────────────────────────────────────
// Fetch link info
// ─────────────────────────────────────────────
async function fetchLinkInfo() {
  isLoading.value = true
  error.value = ''

  try {
    const data = await fetchInviteLinkInfo(token.value)
    linkInfo.value = data
  }
  catch (err: unknown) {
    error.value = formatInviteLinkError(err)
  }
  finally {
    isLoading.value = false
  }
}

onMounted(fetchLinkInfo)

// ─────────────────────────────────────────────
// Accept invite link
// ─────────────────────────────────────────────
async function handleAccept() {
  if (!isAuthenticated.value || !token.value) return

  isAccepting.value = true
  error.value = ''

  try {
    const result = await acceptInviteLink(token.value)

    success.value = true

    // Set the new org as active and navigate to dashboard
    await authClient.organization.setActive({
      organizationId: result.organizationId,
    })

    setTimeout(() => {
      window.location.href = localePath('/dashboard')
    }, 1500)
  }
  catch (err: unknown) {
    error.value = formatInviteLinkError(
      err,
      'We could not join this organization. Ask an administrator for a new invitation.',
    )
  }
  finally {
    isAccepting.value = false
  }
}

function getRoleLabel(role: string) {
  if (role === 'admin') return 'Admin'
  return 'Member'
}

function getRoleIcon(role: string) {
  return role === 'admin' ? ShieldCheck : Shield
}
</script>

<template>
  <!-- Loading state -->
  <div v-if="isLoading" class="flex flex-col items-center gap-3 py-8">
    <div class="size-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    <p class="text-sm text-surface-500 dark:text-surface-400">Loading invite details…</p>
  </div>

  <!-- Error state (invalid/expired link) -->
  <div v-else-if="error && !linkInfo" class="flex flex-col items-center gap-4 py-6">
    <div class="ui-icon-state ui-icon-state-danger">
      <AlertTriangle class="size-6" />
    </div>
    <div class="factory-auth-state-copy text-center">
      <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1">Invalid invite link</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400">{{ error }}</p>
    </div>
    <NuxtLink
      :to="localePath('/auth/sign-in')"
      data-slot="button"
      data-hover-effect="slide"
      class="factory-auth-slide-action inline-flex h-12 min-h-12 w-full items-center justify-center px-5 py-0 text-sm sm:w-auto"
    >
      Go to sign in
    </NuxtLink>
  </div>

  <!-- Success state -->
  <div v-else-if="success" class="flex flex-col items-center gap-4 py-6">
    <div class="ui-icon-state ui-icon-state-success">
      <Check class="size-6" />
    </div>
    <div class="factory-auth-state-copy text-center">
      <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1">You're in!</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        You've joined <strong>{{ linkInfo?.organizationName }}</strong>. Redirecting to dashboard…
      </p>
    </div>
  </div>

  <!-- Link info + accept form -->
  <div v-else-if="linkInfo" class="flex flex-col gap-5">
    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-1">Join organization</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400">You've been invited to join a team on Factory Careers.</p>
    </div>

    <!-- Org info summary -->
    <div class="ui-panel-muted factory-auth-invite-summary">
      <div class="factory-auth-invite-summary-main">
        <div class="ui-icon-state ui-icon-state-brand factory-auth-invite-summary-icon">
          <Building2 class="size-5" />
        </div>
        <div>
          <div class="factory-auth-invite-summary-name">{{ linkInfo.organizationName }}</div>
          <div class="factory-auth-invite-summary-slug">{{ linkInfo.organizationSlug }}</div>
        </div>
      </div>

      <div class="factory-auth-invite-summary-meta">
        <div class="factory-auth-invite-summary-meta-item">
          <component :is="getRoleIcon(linkInfo.role)" class="size-3.5" />
          <span>Join as <strong>{{ getRoleLabel(linkInfo.role) }}</strong></span>
        </div>
        <div v-if="linkInfo.invitedByName" class="factory-auth-invite-summary-meta-item">
          <UserPlus class="size-3.5" />
          <span>Invited by <strong>{{ linkInfo.invitedByName }}</strong></span>
        </div>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="ui-alert ui-alert-danger">
      {{ error }}
    </div>

    <!-- Not authenticated — prompt sign in/up -->
    <div v-if="!isAuthenticated" class="flex flex-col gap-3">
      <p class="text-sm leading-6 text-white/56">
        Sign in or create an account to accept this invitation.
      </p>
      <div class="factory-auth-access-actions grid gap-3 sm:grid-cols-2">
        <NuxtLink
          :to="localePath('/auth/sign-in')"
          data-slot="button"
          data-hover-effect="slide"
          class="factory-auth-slide-action inline-flex h-12 min-h-12 items-center justify-center px-5 py-0 text-sm"
        >
          Sign in
        </NuxtLink>
        <NuxtLink
          :to="localePath('/auth/sign-up')"
          data-slot="button"
          class="ui-button-secondary factory-auth-secondary-action inline-flex h-12 min-h-12 items-center justify-center px-5 py-0 text-sm"
        >
          Create account
        </NuxtLink>
      </div>
    </div>

    <!-- Authenticated — accept button -->
    <button
      v-else
      :disabled="isAccepting"
      data-slot="button"
      data-hover-effect="slide"
      class="factory-auth-slide-action inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 px-5 py-0 text-sm"
      @click="handleAccept"
    >
      <Loader2 v-if="isAccepting" class="size-4 animate-spin" />
      <UserPlus v-else class="size-4" />
      {{ isAccepting ? 'Joining…' : `Join ${linkInfo.organizationName}` }}
    </button>
  </div>
</template>
