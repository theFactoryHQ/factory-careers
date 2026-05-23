<script setup lang="ts">
import { Eye, X, Github, Rocket, Cloud } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { message } = usePreviewReadOnly()

function closeModal() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-50 grid place-items-center p-4"
      @click.self="closeModal"
    >
      <div class="ui-modal-panel relative w-full max-w-md">
        <div class="ui-panel-header flex items-center justify-between px-5 py-4">
          <div class="flex items-center gap-2">
            <Eye class="size-5 text-brand-600 dark:text-brand-400" />
            <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50">You're in demo mode</h3>
          </div>

          <button
            class="ui-button ui-button-ghost p-1.5"
            @click="closeModal"
          >
            <X class="size-5" />
          </button>
        </div>

        <div class="space-y-4 px-5 py-5">
          <p class="text-sm text-surface-600 dark:text-surface-300">
            {{ message }}
          </p>

          <p class="text-sm text-surface-500 dark:text-surface-400">
            Factory Careers access is limited to staff and invited hiring collaborators.
          </p>

          <div class="space-y-2">
            <!-- Cloud hosted option -->
            <NuxtLink
              :to="$localePath('/auth/fresh-signup')"
              class="ui-selectable-panel ui-selectable-panel-active flex items-start gap-3 px-4 py-3 no-underline group"
              @click="closeModal"
            >
              <div class="ui-icon-state ui-icon-state-brand flex items-center justify-center size-9 shrink-0 mt-0.5">
                <Cloud class="size-4" />
              </div>
              <div>
                <div class="text-sm font-semibold text-surface-900 dark:text-surface-100 group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors">Request access</div>
                <div class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Sign in with Microsoft or use an invitation link</div>
              </div>
            </NuxtLink>

            <!-- Self-host option -->
            <a
              href="https://github.com/caffeinebounce/factory-careers"
              target="_blank"
              rel="noopener noreferrer"
              class="ui-selectable-panel flex items-start gap-3 px-4 py-3 no-underline group"
            >
              <div class="ui-icon-state flex items-center justify-center size-9 shrink-0 mt-0.5">
                <Rocket class="size-4" />
              </div>
              <div>
                <div class="text-sm font-semibold text-surface-900 dark:text-surface-100 group-hover:text-surface-700 dark:group-hover:text-surface-200 transition-colors">View source</div>
                <div class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Review the thin AGPL Reqcore fork</div>
              </div>
            </a>
          </div>

          <a
            href="https://github.com/caffeinebounce/factory-careers"
            target="_blank"
            rel="noopener noreferrer"
            class="ui-inline-link ui-inline-link-muted inline-flex items-center gap-1.5 text-xs no-underline"
          >
            <Github class="size-3.5" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  </Teleport>
</template>
