<script setup lang="ts">
import { CheckCircle2, Copy } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  value: string
  label?: string
  title?: string
  tone?: 'default' | 'brand' | 'muted'
  code?: boolean
  compact?: boolean
}>(), {
  label: 'value',
  title: '',
  tone: 'default',
  code: true,
  compact: false,
})

const emit = defineEmits<{
  copied: [value: string]
  error: [value: string]
}>()

const toast = useToast()
const { copied, copy } = useCopyToClipboard()

async function copyValue() {
  if (!props.value) return

  const didCopy = await copy(props.value)
  if (didCopy) {
    emit('copied', props.value)
    return
  }

  emit('error', props.value)
  toast.info(props.value)
}
</script>

<template>
  <button
    type="button"
    class="group relative flex min-h-10 w-full cursor-pointer items-center gap-3 border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
    :class="[
      compact ? 'min-h-9 py-1.5 text-xs' : 'text-sm',
      tone === 'brand'
        ? 'border-brand-200 bg-brand-50/50 text-brand-900 hover:bg-brand-100/70 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-100 dark:hover:bg-brand-950/50'
        : tone === 'muted'
          ? 'border-surface-200 bg-surface-50 text-surface-600 hover:bg-surface-100 dark:border-surface-800 dark:bg-surface-950/70 dark:text-surface-400 dark:hover:bg-surface-900'
          : 'border-surface-200 bg-white text-surface-700 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-800',
    ]"
    :title="title || (copied ? 'Copied' : `Copy ${label}`)"
    :aria-label="`${copied ? 'Copied' : 'Copy'} ${label}`"
    @click="copyValue"
  >
    <span
      class="min-w-0 flex-1 truncate select-text"
      :class="code ? 'font-mono' : ''"
    >
      {{ value }}
    </span>
    <span
      class="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-success-500 transition-all"
      :class="copied ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'"
    >
      Copied
    </span>
    <span class="relative flex size-5 shrink-0 items-center justify-center overflow-hidden">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="scale-50 rotate-12 opacity-0"
        enter-to-class="scale-100 rotate-0 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-50 -rotate-12 opacity-0"
        mode="out-in"
      >
        <CheckCircle2 v-if="copied" key="copied" class="size-4 text-success-500" />
        <Copy v-else key="copy" class="size-4 text-surface-400 transition-colors group-hover:text-brand-500" />
      </Transition>
    </span>
  </button>
</template>