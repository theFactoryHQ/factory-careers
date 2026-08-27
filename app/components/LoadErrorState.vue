<script setup lang="ts">
import { AlertTriangle, Briefcase } from 'lucide-vue-next'
import {
  getFetchStatusCode,
  isNotFoundFetchError,
} from '~/utils/fetch-error'

const props = withDefaults(defineProps<{
  error: unknown
  variant?: 'hero' | 'banner'
  notFoundTitle?: string
  notFoundMessage: string
  failedTitle?: string
  failedMessage?: string
  retryLabel?: string
  /** Extra HTTP statuses that should hide Retry, e.g. expired 400 interview links. */
  permanentStatusCodes?: number[]
}>(), {
  variant: 'banner',
  notFoundTitle: 'Not found',
  failedTitle: 'Couldn\'t load this page',
  failedMessage: 'A temporary problem prevented us from loading this page. Check your connection and try again.',
  retryLabel: 'Retry',
  permanentStatusCodes: () => [],
})

const emit = defineEmits<{
  retry: []
}>()

const statusCode = computed(() => getFetchStatusCode(props.error))
const isNotFound = computed(() =>
  isNotFoundFetchError(props.error)
  || (statusCode.value != null && props.permanentStatusCodes.includes(statusCode.value)),
)
const title = computed(() => isNotFound.value ? props.notFoundTitle : props.failedTitle)
const message = computed(() => isNotFound.value ? props.notFoundMessage : props.failedMessage)
</script>

<template>
  <div
    v-if="variant === 'hero'"
    class="flex flex-col items-center justify-center py-20 text-center"
    :role="isNotFound ? 'status' : 'alert'"
  >
    <div class="mb-5 flex size-16 items-center justify-center border border-white/10 bg-white/[0.03]">
      <Briefcase v-if="isNotFound" class="size-7 text-brand-500" />
      <AlertTriangle v-else class="size-7 text-brand-500" />
    </div>
    <h1 class="mb-2 text-xl font-semibold text-white">{{ title }}</h1>
    <p class="mb-6 max-w-xs text-sm text-white/50">{{ message }}</p>
    <div class="flex flex-col items-center gap-3 sm:flex-row">
      <button
        v-if="!isNotFound"
        type="button"
        class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] cursor-pointer items-center justify-center gap-2 px-5 py-0 transition-colors"
        @click="emit('retry')"
      >
        {{ retryLabel }}
      </button>
      <slot />
    </div>
  </div>

  <div
    v-else
    class="ui-alert ui-alert-danger flex flex-wrap items-center gap-2 p-4 text-sm"
    :role="isNotFound ? 'status' : 'alert'"
  >
    <span>{{ message }}</span>
    <button
      v-if="!isNotFound"
      type="button"
      class="cursor-pointer font-medium underline"
      @click="emit('retry')"
    >
      {{ retryLabel }}
    </button>
    <slot />
  </div>
</template>
