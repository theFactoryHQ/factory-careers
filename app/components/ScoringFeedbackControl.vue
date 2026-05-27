<script setup lang="ts">
import { Check, Loader2, MessageSquare, ThumbsDown, ThumbsUp, X } from 'lucide-vue-next'

const props = defineProps<{
  applicationId: string
  analysisRunId: string | null
}>()

const toast = useToast()
const isFeedbackOpen = ref(false)
const isSubmitting = ref(false)
const comment = ref('')
const savedSentiment = ref<'up' | 'down' | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const feedbackPanelRef = ref<HTMLElement | null>(null)
const { floatingStyle: feedbackPanelStyle } = useFloatingMenu({
  open: isFeedbackOpen,
  triggerRef,
  placement: 'bottom-end',
  width: 288,
  estimatedHeight: 220,
  zIndex: 90,
})

const canSubmitFeedback = computed(() => Boolean(props.analysisRunId) && !isSubmitting.value)

async function submitFeedback(sentiment: 'up' | 'down') {
  if (!canSubmitFeedback.value) return
  if (sentiment === 'down' && !comment.value.trim()) {
    isFeedbackOpen.value = true
    return
  }

  isSubmitting.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/scoring-feedback`, {
      method: 'POST',
      body: {
        sentiment,
        analysisRunId: props.analysisRunId,
        comment: sentiment === 'down' ? comment.value : undefined,
      },
    })
    savedSentiment.value = sentiment
    isFeedbackOpen.value = false
    comment.value = ''
    toast.success('Scoring feedback saved')
  } catch (err: any) {
    toast.error('Failed to save scoring feedback', {
      message: err?.data?.statusMessage ?? err?.message,
      statusCode: err?.data?.statusCode ?? err?.statusCode,
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="group/scoring-feedback relative inline-flex items-center">
    <button
      ref="triggerRef"
      type="button"
      class="factory-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center border text-white/58 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      :disabled="!analysisRunId"
      :aria-label="analysisRunId ? 'Leave scoring feedback' : 'Run scoring before leaving feedback'"
      @click="isFeedbackOpen = !isFeedbackOpen"
    >
      <Check v-if="savedSentiment === 'up'" class="size-3.5 text-success-400" />
      <ThumbsDown v-else-if="savedSentiment === 'down'" class="size-3.5 text-brand-400" />
      <MessageSquare v-else class="size-3.5" />
    </button>

    <div
      class="absolute right-0 top-full z-30 mt-2 hidden min-w-max items-center gap-1 border border-white/12 bg-black p-1 shadow-xl group-hover/scoring-feedback:flex group-focus-within/scoring-feedback:flex"
    >
      <button
        type="button"
        class="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-success-400 transition-colors hover:bg-success-500/12 hover:text-success-300 disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!canSubmitFeedback"
        aria-label="Mark scoring as helpful"
        @click="submitFeedback('up')"
      >
        <Loader2 v-if="isSubmitting" class="size-3.5 animate-spin" />
        <ThumbsUp v-else class="size-3.5" />
      </button>
      <button
        type="button"
        class="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-brand-400 transition-colors hover:bg-brand-500/12 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!canSubmitFeedback"
        aria-label="Leave feedback on scoring"
        @click="isFeedbackOpen = true"
      >
        <ThumbsDown class="size-3.5" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="isFeedbackOpen"
        ref="feedbackPanelRef"
        class="ui-floating-menu factory-dashboard-portal border border-white/12 bg-black p-3 shadow-xl"
        :style="feedbackPanelStyle"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-xs font-semibold uppercase text-white/68">Scoring feedback</p>
          <button
            type="button"
            class="inline-flex h-6 w-6 cursor-pointer items-center justify-center text-white/58 hover:text-white"
            aria-label="Close scoring feedback"
            @click="isFeedbackOpen = false"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <textarea
          v-model="comment"
          rows="3"
          class="ui-field min-h-20 w-full resize-none text-sm"
          placeholder="What should the AI improve about this score?"
        />
        <div class="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            class="factory-toolbar-button cursor-pointer border px-3 py-1.5 text-xs font-medium text-white/78 hover:text-white"
            @click="isFeedbackOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="factory-button-cta factory-button-premium inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 px-3 py-0 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canSubmitFeedback || !comment.trim()"
            @click="submitFeedback('down')"
          >
            <Loader2 v-if="isSubmitting" class="size-3 animate-spin" />
            Save
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
