<script setup lang="ts">
import { Check, Copy, Mail } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  email: string | null | undefined
  showIcon?: boolean
}>(), {
  showIcon: true,
})

const toast = useToast()
const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null

function copyEmailWithTextarea(email: string) {
  const textarea = document.createElement('textarea')
  textarea.value = email
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copiedViaFallback = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copiedViaFallback) throw new Error('Clipboard copy failed')
}

async function copyEmail() {
  const email = props.email?.trim()
  if (!email) return

  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(email)
    } catch {
      copyEmailWithTextarea(email)
    }

    copied.value = true
    toast.success('Email copied', email)

    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    toast.info(email)
  }
}

onBeforeUnmount(() => {
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <button
    type="button"
    class="inline-flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left transition-colors hover:text-brand-400 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60"
    :title="copied ? 'Copied email' : 'Copy email'"
    :aria-label="copied ? 'Copied email' : 'Copy email'"
    @click.stop="copyEmail"
  >
    <Check v-if="copied" class="size-3.5 shrink-0 text-success-500" />
    <Mail v-else-if="showIcon" class="size-3.5 shrink-0" />
    <Copy v-else class="size-3.5 shrink-0 opacity-60" />
    <span class="truncate">
      {{ email }}
    </span>
  </button>
</template>
