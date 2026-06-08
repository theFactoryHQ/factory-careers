<script setup lang="ts">
import {
  filterVisibleSettingsNav,
  settingsNavItems,
  settingsNavMobileLabel,
} from '~/config/settings-nav'

const route = useRoute()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const languageFeatureEnabled = runtimeConfig.public.languageFeatureEnabled === true

const visibleSettingsNav = computed(() =>
  filterVisibleSettingsNav(settingsNavItems, languageFeatureEnabled),
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
        {{ settingsNavMobileLabel(item) }}
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