<script setup lang="ts">
import {
  Building2, Users, UserCircle, Plug, Brain, ShieldCheck, Globe,
} from 'lucide-vue-next'

const route = useRoute()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const languageFeatureEnabled = runtimeConfig.public.languageFeatureEnabled === true

const settingsNav = [
  {
    label: 'General',
    to: '/dashboard/settings',
    icon: Building2,
    exact: true,
  },
  {
    label: 'Localization',
    to: '/dashboard/settings/localization',
    icon: Globe,
    exact: true,
  },
  {
    label: 'Members',
    to: '/dashboard/settings/members',
    icon: Users,
    exact: true,
  },
  {
    label: 'Integrations',
    to: '/dashboard/settings/integrations',
    icon: Plug,
    exact: true,
  },
  {
    label: 'AI',
    to: '/dashboard/settings/ai',
    icon: Brain,
    exact: true,
  },
  {
    label: 'SSO',
    to: '/dashboard/settings/sso',
    icon: ShieldCheck,
    exact: true,
  },
  {
    label: 'Account',
    to: '/dashboard/settings/account',
    icon: UserCircle,
    exact: true,
  },
]

const visibleSettingsNav = computed(() =>
  settingsNav.filter((item) => languageFeatureEnabled || item.to !== '/dashboard/settings/localization'),
)

function isActive(to: string, exact: boolean) {
  const localizedTo = localePath(to)
  if (exact) return route.path === localizedTo
  return route.path === localizedTo || route.path.startsWith(`${localizedTo}/`)
}
</script>

<template>
  <div class="ui-nav-shell border-b shadow-sm">
    <!-- Back link + title -->
    <div class="flex items-center gap-3 px-4 pt-3 pb-2">
      <AppBackLink
        :to="$localePath('/dashboard')"
        class="shrink-0"
      >
        Back
      </AppBackLink>
      <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
        Settings
      </h2>
    </div>

    <!-- Scrollable tabs -->
    <nav class="flex overflow-x-auto px-3 gap-1 pb-2 scrollbar-none">
      <NuxtLink
        v-for="item in visibleSettingsNav"
        :key="item.to"
        :to="$localePath(item.to)"
        class="ui-nav-link flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium no-underline shrink-0"
        :class="isActive(item.to, item.exact)
          ? 'ui-nav-link-active'
          : ''"
      >
        <component :is="item.icon" class="size-3.5" />
        {{ item.label }}
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
</style>
