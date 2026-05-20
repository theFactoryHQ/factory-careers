<script setup lang="ts">
import {
  User, Save, Loader2, Check, Mail,
} from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Account Settings — Factory Careers',
<<<<<<< HEAD
  description: 'Manage your Factory Careers profile.',
=======
  description: 'Manage your personal account settings',
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
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
  <div class="ui-settings-page">
    <!-- Page title -->
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        Account
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        Manage your Factory Careers profile.
      </p>
    </div>

    <!-- Profile section -->
    <section class="ui-panel ui-settings-panel">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-brand flex items-center justify-center size-10 shrink-0 rounded-lg">
            <User class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Profile</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400">Your personal information.</p>
          </div>
        </div>
      </div>

      <div class="ui-settings-panel-body space-y-5">
        <!-- Avatar row -->
        <div class="flex items-center gap-4">
          <div v-if="session?.user?.image" class="size-16 rounded-full overflow-hidden ring-2 ring-surface-200 dark:ring-surface-700">
            <img :src="session.user.image" :alt="session.user.name" class="size-full object-cover" />
          </div>
          <div
            v-else
            class="size-16 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-lg font-bold text-brand-700 dark:text-brand-300 ring-2 ring-surface-200 dark:ring-surface-700"
          >
            {{ getInitials(session?.user?.name) }}
          </div>
          <div>
            <p class="text-sm font-medium text-surface-900 dark:text-surface-100">{{ session?.user?.name }}</p>
            <a
              :href="session?.user?.email ? `mailto:${session.user.email}` : undefined"
              target="_blank"
              class="text-sm text-surface-500 dark:text-surface-400 flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400 hover:underline cursor-pointer transition-colors"
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
            <span v-if="profileSuccess" class="text-sm text-success-600 dark:text-success-400 font-medium flex items-center gap-1.5">
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

  </div>
</template>
