<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

definePageMeta({
  layout: 'settings',
  middleware: ['auth', 'require-org'],
})
</script>

<template>
  <NuxtErrorBoundary>
    <NuxtPage />

    <template #error="{ error, clearError }">
      <div class="mx-auto max-w-2xl mt-8">
        <div class="ui-panel ui-panel-danger p-6">
          <div class="flex items-center gap-3 mb-3">
            <AlertTriangle class="ui-icon-danger size-5" />
            <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Something went wrong</h2>
          </div>
          <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">
            {{ error?.message || 'An unexpected error occurred while loading this page.' }}
          </p>
          <button
            class="ui-button ui-button-primary"
            @click="clearError"
          >
            Try again
          </button>
        </div>
      </div>
    </template>
  </NuxtErrorBoundary>
</template>
