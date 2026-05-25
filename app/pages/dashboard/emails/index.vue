<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Email Workflows — Factory Careers',
  description: 'Configure automated candidate email workflow sends',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">
        Email Workflows
      </h1>
      <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
        Configure which candidate emails send automatically and which templates each workflow uses.
      </p>
    </div>

    <EmailSectionTabs />
    <EmailWorkflowSettings />
  </div>
</template>
