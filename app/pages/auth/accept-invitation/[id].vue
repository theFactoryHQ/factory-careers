<script setup lang="ts">
import { AlertTriangle, Check } from 'lucide-vue-next'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Accept Invitation — Factory Careers',
  description: 'Accept an organization invitation on Factory Careers',
  robots: 'noindex, nofollow',
})

const route = useRoute()
const localePath = useLocalePath()

const invitationId = computed(() => route.params.id as string)

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
const isAccepting = ref(false)
const error = ref('')
const success = ref(false)
const joinedOrgName = ref('')

// Check authentication state
const { data: session } = await authClient.useSession(useFetch)
const isAuthenticated = computed(() => !!session.value?.user)

// ─────────────────────────────────────────────
// Auto-accept when authenticated
// ─────────────────────────────────────────────
async function handleAccept() {
  if (!isAuthenticated.value || !invitationId.value) return

  isAccepting.value = true
  error.value = ''

  try {
    const result = await authClient.organization.acceptInvitation({
      invitationId: invitationId.value,
    })

    if (result.error) {
      error.value = result.error.message ?? 'Failed to accept invitation.'
      isAccepting.value = false
      return
    }

    success.value = true
    joinedOrgName.value = result.data?.member?.organizationId ?? ''

    // Set the joined org as active and redirect to dashboard
    if (result.data?.member?.organizationId) {
      await authClient.organization.setActive({
        organizationId: result.data.member.organizationId,
      })
    }

    setTimeout(() => {
      window.location.href = localePath('/dashboard')
    }, 1500)
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to accept invitation'
    error.value = message
  }
  finally {
    isAccepting.value = false
  }
}

// Auto-accept on mount if already authenticated
onMounted(() => {
  if (isAuthenticated.value) {
    handleAccept()
  }
})
</script>

<template>
  <!-- Success state -->
  <div v-if="success" class="flex flex-col items-center gap-4 py-6">
    <div class="flex items-center justify-center size-12 rounded-full bg-success-100 dark:bg-success-950 text-success-600 dark:text-success-400">
      <Check class="size-6" />
    </div>
    <div class="text-center">
      <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1">You're in!</h2>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        Invitation accepted. Redirecting to dashboard…
      </p>
    </div>
  </div>

  <!-- Accepting state (auto-accept in progress) -->
  <div v-else-if="isAccepting" class="flex flex-col items-center gap-3 py-8">
    <div class="size-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    <p class="text-sm text-surface-500 dark:text-surface-400">Accepting invitation…</p>
  </div>

  <!-- Error state -->
  <div v-else-if="error" class="space-y-5 py-2">
    <div class="space-y-2">
      <div class="flex size-10 items-center justify-center border border-danger-400/40 bg-danger-950/35 text-danger-300">
        <AlertTriangle class="size-5" />
      </div>
      <h2 class="text-xl font-light leading-tight text-white">Invitation error</h2>
      <p class="text-sm leading-6 text-white/56">{{ error }}</p>
    </div>
    <div class="factory-auth-access-actions grid gap-3 sm:grid-cols-2">
      <button
        data-slot="button"
        data-hover-effect="slide"
        class="factory-auth-slide-action inline-flex h-12 min-h-12 items-center justify-center px-5 py-0 text-sm"
        @click="handleAccept"
      >
        Try again
      </button>
      <NuxtLink
        :to="localePath('/auth/sign-in')"
        data-slot="button"
        class="factory-auth-secondary-action inline-flex h-12 min-h-12 items-center justify-center px-5 py-0 text-sm"
      >
        Go to sign in
      </NuxtLink>
    </div>
  </div>

  <!-- Not authenticated — prompt sign in/up -->
  <div v-else class="space-y-5">
    <div class="space-y-2">
      <h2 class="text-xl font-light leading-tight text-white">Accept invitation</h2>
      <p class="text-sm leading-6 text-white/56">
        You've been invited to join an organization on Factory Careers.
      </p>
    </div>

    <p class="text-sm leading-6 text-white/56">
      Sign in or create an account to accept this invitation.
    </p>

    <div class="factory-auth-access-actions grid gap-3 sm:grid-cols-2">
      <NuxtLink
        :to="localePath({ path: '/auth/sign-in', query: { invitation: invitationId } })"
        data-slot="button"
        data-hover-effect="slide"
        class="factory-auth-slide-action inline-flex h-12 min-h-12 items-center justify-center px-5 py-0 text-sm"
      >
        Sign in
      </NuxtLink>
      <NuxtLink
        :to="localePath({ path: '/auth/sign-up', query: { invitation: invitationId } })"
        data-slot="button"
        class="factory-auth-secondary-action inline-flex h-12 min-h-12 items-center justify-center px-5 py-0 text-sm"
      >
        Create account
      </NuxtLink>
    </div>
  </div>
</template>
