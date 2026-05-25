import type { MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue } from 'vue'
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

type ApplicationWithStatus = {
  status?: string | null
}

type TransitionContext = {
  fromStatus?: string | null
  toStatus: string
}

type UseApplicationStatusActionsOptions = {
  application: MaybeRefOrGetter<ApplicationWithStatus | null | undefined>
  updateStatus: (status: string) => Promise<unknown>
  afterTransition?: (context: TransitionContext) => Promise<unknown> | unknown
  trackTransition?: (context: TransitionContext) => void
}

export function useApplicationStatusActions(options: UseApplicationStatusActionsOptions) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const toast = useToast()

  const allowedTransitions = computed(() => {
    const status = toValue(options.application)?.status
    if (!status) return []
    return APPLICATION_STATUS_TRANSITIONS[status as keyof typeof APPLICATION_STATUS_TRANSITIONS] ?? []
  })

  const isTransitioning = ref(false)

  async function transitionToStatus(newStatus: string) {
    const context = {
      fromStatus: toValue(options.application)?.status,
      toStatus: newStatus,
    }

    isTransitioning.value = true
    try {
      await options.updateStatus(newStatus)
      options.trackTransition?.(context)
      await options.afterTransition?.(context)
    } catch (err: any) {
      if (handlePreviewReadOnlyError(err)) return
      toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    } finally {
      isTransitioning.value = false
    }
  }

  return {
    allowedTransitions,
    isTransitioning,
    transitionToStatus,
  }
}
