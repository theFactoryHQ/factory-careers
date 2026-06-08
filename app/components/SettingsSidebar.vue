<script setup lang="ts">
import { Settings } from 'lucide-vue-next'
import { filterVisibleSettingsNav, settingsNavItems } from '~/config/settings-nav'

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
  <aside
    class="ui-nav-shell flex h-full w-56 min-w-56 flex-col border-r overflow-y-auto overscroll-contain"
  >
    <!-- Header -->
    <div class="px-4 pt-5 pb-4">
      <AppBackLink
        :to="$localePath('/dashboard')"
        class="mb-3"
      >
        Back to Jobs
      </AppBackLink>
      <div class="flex items-center gap-2.5">
        <div class="ui-nav-icon flex items-center justify-center size-8 rounded-lg">
          <Settings class="size-4" />
        </div>
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
          Settings
        </h2>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-3 pb-5">
      <div class="flex flex-col gap-0.5">
        <NuxtLink
          v-for="item in visibleSettingsNav"
          :key="item.to"
          :to="$localePath(item.to)"
          class="ui-nav-link group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm no-underline"
          :class="isActive(item.to, item.exact)
            ? 'ui-nav-link-active'
            : ''"
        >
          <div
            class="ui-nav-icon flex items-center justify-center size-8 rounded-md"
            :class="isActive(item.to, item.exact)
              ? 'ui-nav-icon-active'
              : ''"
          >
            <component :is="item.icon" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 leading-tight">
              <span class="truncate">{{ item.label }}</span>
              <span
                v-if="item.badge"
                class="shrink-0 inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
              >
                {{ item.badge }}
              </span>
            </div>
            <div
              class="text-[11px] leading-tight mt-0.5 truncate"
              :class="isActive(item.to, item.exact)
                ? 'text-brand-500/70 dark:text-brand-400/60'
                : 'text-surface-400 dark:text-surface-500'"
            >
              {{ item.description }}
            </div>
          </div>
        </NuxtLink>
      </div>
    </nav>
  </aside>
</template>