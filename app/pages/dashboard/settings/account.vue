<script setup lang="ts">
import {
  User, Lock, Save, Loader2, Eye, EyeOff, Check,
  KeyRound, Mail, Calendar,
} from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Account Settings — Factory Careers',
  description: 'Manage your personal account settings',
})

const { data: session } = await authClient.useSession(useFetch)

// ─────────────────────────────────────────────
// Profile editing
// ─────────────────────────────────────────────
const profileName = ref('')
const isSavingProfile = ref(false)
const profileSuccess = ref(false)
const profileError = ref('')

watch(() => session.value?.user, (user) => {
  if (user) {
    profileName.value = user.name ?? ''
  }
}, { immediate: true })

async function handleSaveProfile() {
  isSavingProfile.value = true
  profileError.value = ''
  profileSuccess.value = false

  try {
    const result = await authClient.updateUser({
      name: profileName.value.trim(),
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to update profile'))
    profileSuccess.value = true
    setTimeout(() => { profileSuccess.value = false }, 3000)
  }
  catch (err: unknown) {
    profileError.value = err instanceof Error ? err.message : 'Failed to update profile'
  }
  finally {
    isSavingProfile.value = false
  }
}

// ─────────────────────────────────────────────
// Password change
// ─────────────────────────────────────────────
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const isChangingPassword = ref(false)
const passwordSuccess = ref(false)
const passwordError = ref('')

const passwordsMatch = computed(() =>
  newPassword.value === confirmPassword.value && newPassword.value.length > 0,
)

const passwordStrength = computed(() => {
  const pw = newPassword.value
  if (pw.length === 0) return { label: '', fillClass: '', textColor: '', width: '0%' }
  if (pw.length < 8) return { label: 'Too short', fillClass: 'ui-meter-fill-danger', textColor: 'ui-meter-label-danger', width: '20%' }

  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  if (score <= 2) return { label: 'Weak', fillClass: 'ui-meter-fill-danger', textColor: 'ui-meter-label-danger', width: '40%' }
  if (score <= 3) return { label: 'Fair', fillClass: 'ui-meter-fill-warning', textColor: 'ui-meter-label-warning', width: '60%' }
  if (score <= 4) return { label: 'Good', fillClass: 'ui-meter-fill-brand', textColor: 'ui-meter-label-brand', width: '80%' }
  return { label: 'Strong', fillClass: 'ui-meter-fill-success', textColor: 'ui-meter-label-success', width: '100%' }
})

async function handleChangePassword() {
  if (!passwordsMatch.value || !currentPassword.value) return
  isChangingPassword.value = true
  passwordError.value = ''
  passwordSuccess.value = false

  try {
    const result = await authClient.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to change password'))
    passwordSuccess.value = true
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    setTimeout(() => { passwordSuccess.value = false }, 3000)
  }
  catch (err: unknown) {
    passwordError.value = err instanceof Error ? err.message : 'Failed to change password'
  }
  finally {
    isChangingPassword.value = false
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getInitials(name: string | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <!-- Page title -->
    <div class="mb-6">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        Account
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        Manage your personal profile and security settings.
      </p>
    </div>

    <!-- Profile section -->
    <section class="ui-panel overflow-hidden">
      <div class="ui-panel-header px-4 sm:px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10 shrink-0">
            <User class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Profile</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Your personal information.</p>
          </div>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-5 space-y-5">
        <!-- Avatar row -->
        <div class="flex items-center gap-4">
          <div v-if="session?.user?.image" class="ui-avatar size-16">
            <img :src="session.user.image" :alt="session.user.name" class="size-full object-cover" />
          </div>
          <div
            v-else
            class="ui-avatar ui-avatar-brand size-16 text-lg font-bold"
          >
            {{ getInitials(session?.user?.name) }}
          </div>
          <div>
            <p class="text-sm font-medium text-surface-900 dark:text-surface-100">{{ session?.user?.name }}</p>
            <a
              :href="session?.user?.email ? `mailto:${session.user.email}` : undefined"
              target="_blank"
              class="ui-inline-link inline-flex items-center gap-1.5 text-sm"
            >
              <Mail class="size-3.5" />
              {{ session?.user?.email }}
            </a>
          </div>
        </div>

        <!-- Name field -->
        <div>
          <label for="profile-name" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Display name
          </label>
          <input
            id="profile-name"
            v-model="profileName"
            type="text"
            class="ui-field"
            placeholder="Your name"
          />
        </div>

        <!-- Email (read-only) -->
        <div>
          <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Email address
          </label>
          <div class="ui-panel-muted px-3 py-2 text-sm text-surface-500 dark:text-surface-400">
            {{ session?.user?.email }}
          </div>
          <p class="mt-1.5 text-xs text-surface-400 dark:text-surface-500">
            Email cannot be changed at this time.
          </p>
        </div>

        <!-- Save button -->
        <div class="flex items-center gap-3 pt-2">
          <button
            :disabled="isSavingProfile"
            class="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleSaveProfile"
          >
            <Loader2 v-if="isSavingProfile" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            {{ isSavingProfile ? 'Saving…' : 'Save profile' }}
          </button>

          <Transition
            enter-active-class="transition-opacity duration-300"
            leave-active-class="transition-opacity duration-300"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <span v-if="profileSuccess" class="ui-feedback-success text-sm">
              <Check class="size-4" />
              Profile updated
            </span>
          </Transition>
        </div>

        <div v-if="profileError" class="ui-alert ui-alert-danger">
          {{ profileError }}
        </div>
      </div>
    </section>

    <!-- Password section -->
    <section class="ui-panel mt-8 overflow-hidden">
      <div class="ui-panel-header px-4 sm:px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-tile size-10 shrink-0">
            <KeyRound class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Password</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Change your account password.</p>
          </div>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-5 space-y-5">
        <!-- Current password -->
        <div>
          <label for="current-password" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Current password
          </label>
          <div class="relative">
            <input
              id="current-password"
              v-model="currentPassword"
              :type="showCurrentPassword ? 'text' : 'password'"
              autocomplete="current-password"
              class="ui-field pr-10"
              placeholder="Enter current password"
            />
            <button
              type="button"
              class="ui-field-icon-button absolute right-2.5 top-1/2 -translate-y-1/2"
              @click="showCurrentPassword = !showCurrentPassword"
            >
              <EyeOff v-if="showCurrentPassword" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </div>
        </div>

        <!-- New password -->
        <div>
          <label for="new-password" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            New password
          </label>
          <div class="relative">
            <input
              id="new-password"
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              autocomplete="new-password"
              class="ui-field pr-10"
              placeholder="Enter new password"
            />
            <button
              type="button"
              class="ui-field-icon-button absolute right-2.5 top-1/2 -translate-y-1/2"
              @click="showNewPassword = !showNewPassword"
            >
              <EyeOff v-if="showNewPassword" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </div>

          <!-- Password strength meter -->
          <div v-if="newPassword" class="mt-2">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-surface-500 dark:text-surface-400">Password strength</span>
              <span class="text-xs font-medium" :class="passwordStrength.textColor">
                {{ passwordStrength.label }}
              </span>
            </div>
            <div class="ui-meter-track h-1.5">
              <div
                class="ui-meter-fill"
                :class="passwordStrength.fillClass"
                :style="{ width: passwordStrength.width }"
              />
            </div>
          </div>
        </div>

        <!-- Confirm password -->
        <div>
          <label for="confirm-password" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="ui-field"
            placeholder="Confirm new password"
          />
          <p
            v-if="confirmPassword && !passwordsMatch"
            class="ui-feedback-danger mt-1.5 text-xs"
          >
            Passwords do not match.
          </p>
          <p
            v-if="confirmPassword && passwordsMatch"
            class="ui-feedback-success mt-1.5 text-xs"
          >
            <Check class="size-3" />
            Passwords match
          </p>
        </div>

        <!-- Save button -->
        <div class="flex items-center gap-3 pt-2">
          <button
            :disabled="isChangingPassword || !passwordsMatch || !currentPassword"
            class="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleChangePassword"
          >
            <Loader2 v-if="isChangingPassword" class="size-4 animate-spin" />
            <Lock v-else class="size-4" />
            {{ isChangingPassword ? 'Changing…' : 'Change password' }}
          </button>

          <Transition
            enter-active-class="transition-opacity duration-300"
            leave-active-class="transition-opacity duration-300"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <span v-if="passwordSuccess" class="ui-feedback-success text-sm">
              <Check class="size-4" />
              Password changed
            </span>
          </Transition>
        </div>

        <div v-if="passwordError" class="ui-alert ui-alert-danger">
          {{ passwordError }}
        </div>
      </div>
    </section>

    <!-- Session info -->
    <section class="ui-panel mt-8 overflow-hidden">
      <div class="ui-panel-header px-4 sm:px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-tile size-10 shrink-0">
            <Calendar class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Session</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Your current login session details.</p>
          </div>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-5">
        <dl class="space-y-3">
          <div class="flex items-center justify-between">
            <dt class="text-sm text-surface-500 dark:text-surface-400">Session ID</dt>
            <dd class="text-sm font-mono text-surface-700 dark:text-surface-300">
              {{ session?.session?.id ? `${session.session.id.slice(0, 8)}…` : '—' }}
            </dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-sm text-surface-500 dark:text-surface-400">Created</dt>
            <dd class="text-sm text-surface-700 dark:text-surface-300">
              {{ session?.session?.createdAt ? new Date(session.session.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—' }}
            </dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-sm text-surface-500 dark:text-surface-400">Expires</dt>
            <dd class="text-sm text-surface-700 dark:text-surface-300">
              {{ session?.session?.expiresAt ? new Date(session.session.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—' }}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
</template>
