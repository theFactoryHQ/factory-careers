<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  loading?: boolean
  loadingLabel?: string
  confirmDisabled?: boolean
  closeOnBackdrop?: boolean
  centered?: boolean
  showDangerIcon?: boolean
  panelClass?: string
  ariaLabel?: string
}>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'default',
  loading: false,
  confirmDisabled: false,
  closeOnBackdrop: true,
  centered: false,
  showDangerIcon: false,
  panelClass: 'max-w-sm p-6',
  ariaLabel: 'Confirm',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const confirmButtonClass = computed(() => (
  props.variant === 'danger'
    ? 'ui-button ui-button-danger'
    : 'ui-button ui-button-primary'
))

function handleClose() {
  emit('close')
}

function handleConfirm() {
  emit('confirm')
}
</script>

<template>
  <AppModalShell
    layout="flex"
    :close-on-backdrop="closeOnBackdrop"
    :aria-label="ariaLabel"
    @close="handleClose"
  >
    <AppModalPanel :class="[panelClass, centered ? 'text-center' : '']">
      <div
        v-if="showDangerIcon"
        class="ui-icon-state ui-icon-state-danger mx-auto mb-4 size-12"
      >
        <Trash2 class="size-5" />
      </div>

      <h3
        class="font-semibold text-surface-900 dark:text-surface-100 mb-2"
        :class="centered ? 'text-base' : 'text-lg'"
      >
        {{ title }}
      </h3>

      <slot>
        <p
          v-if="message"
          class="text-sm mb-5"
          :class="centered
            ? 'text-surface-500 dark:text-surface-400 mb-6'
            : 'text-surface-600 dark:text-surface-400'"
        >
          {{ message }}
        </p>
      </slot>

      <div
        class="flex gap-2"
        :class="centered ? 'items-center justify-center gap-3' : 'justify-end'"
      >
        <button
          type="button"
          :disabled="loading"
          class="ui-button ui-button-secondary"
          :class="centered ? 'px-4 py-2.5 text-sm' : 'px-3 py-1.5 text-sm'"
          @click="handleClose"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          :disabled="loading || confirmDisabled"
          :class="[
            confirmButtonClass,
            centered ? 'px-5 py-2.5 text-sm font-semibold' : 'px-3 py-1.5 text-sm',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ]"
          @click="handleConfirm"
        >
          {{ loading ? (loadingLabel ?? `${confirmLabel}…`) : confirmLabel }}
        </button>
      </div>
    </AppModalPanel>
  </AppModalShell>
</template>