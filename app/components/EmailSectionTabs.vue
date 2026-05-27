<script setup lang="ts">
const localePath = useLocalePath()

const tabs = [
  { label: 'Workflow Settings', to: '/dashboard/emails', exact: true },
  { label: 'Templates', to: '/dashboard/emails/templates', exact: false },
]
</script>

<template>
  <nav class="mb-6 flex flex-wrap items-center gap-2 border-b border-surface-200 dark:border-surface-800">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="localePath(tab.to)"
      class="-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-semibold no-underline transition-colors"
      :class="$route.path === localePath(tab.to) || (!tab.exact && $route.path.startsWith(localePath(tab.to)))
        ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
        : 'border-transparent text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100'"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
