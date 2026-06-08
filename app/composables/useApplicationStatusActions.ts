import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, ref, toValue } from 'vue'
import type { ApplicationStatus } from '~~/shared/application-status'
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

type ApplicationWithStatus = {
  status?: string | null
}

type TransitionContext = {
  fromStatus?: string | null
  toStatus: ApplicationStatus
}

type UseApplicationStatusActionsOptions = {
  application: MaybeRefOrGetter<ApplicationWithStatus | null | undefined>
  updateStatus: (status: ApplicationStatus) => Promise<unknown>
  afterTransition?: (context: TransitionContext) => Promise<unknown> | unknown
  trackTransition?: (context: TransitionContext) => void
  transitionKey?: MaybeRefOrGetter<string | null | undefined>
  transitioningKeys?: Ref<Set<string>>
}

export function useApplicationStatusActions(options: UseApplicationStatusActionsOptions) {
  const { handlePreviewReadOnlyError } = usePreviewReadOnly()
  const toast = useToast()

  const allowedTransitions = computed((): ApplicationStatus[] => {
    const status = toValue(options.application)?.status
    if (!status) return []
    return (APPLICATION_STATUS_TRANSITIONS[status as ApplicationStatus] ?? []) as ApplicationStatus[]
  })

  const isTransitioning = ref(false)

  function markTransitionStart(key: string | null | undefined) {
    if (!key || !options.transitioningKeys) return
    options.transitioningKeys.value = new Set([...options.transitioningKeys.value, key])
  }

  function markTransitionEnd(key: string | null | undefined) {
    if (!key || !options.transitioningKeys) return
    const nextKeys = new Set(options.transitioningKeys.value)
    nextKeys.delete(key)
    options.transitioningKeys.value = nextKeys
  }

  async function transitionToStatus(newStatus: ApplicationStatus) {
    const context = {
      fromStatus: toValue(options.application)?.status,
      toStatus: newStatus,
    }
    const transitionKey = toValue(options.transitionKey)

    if (transitionKey && options.transitioningKeys?.value.has(transitionKey)) return

    isTransitioning.value = true
    markTransitionStart(transitionKey)
    try {
      await options.updateStatus(newStatus)
      options.trackTransition?.(context)
      await options.afterTransition?.(context)
    } catch (err: any) {
      if (handlePreviewReadOnlyError(err)) return
      toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
    } finally {
      isTransitioning.value = false
      markTransitionEnd(transitionKey)
    }
  }

  return {
    allowedTransitions,
    isTransitioning,
    transitionToStatus,
  }
}
