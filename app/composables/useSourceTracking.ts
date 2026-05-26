/**
 * Composable for source tracking analytics and tracking link management.
 * Provides data for the source tracking dashboard and link CRUD operations.
 */

interface TrackingLink {
  id: string
  jobId: string | null
  jobTitle: string | null
  channel: string
  name: string
  code: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
  clickCount: number
  applicationCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface SourceStats {
  channelBreakdown: { channel: string; count: number }[]
  topLinks: {
    id: string
    name: string
    channel: string
    code: string
    jobTitle: string | null
    clickCount: number
    applicationCount: number
    isActive: boolean
  }[]
  funnel: Record<string, Record<string, number>>
  dailyTrend: { date: string; channel: string; count: number }[]
  recentAttributed: {
    applicationId: string
    jobId: string
    channel: string
    utmSource: string | null
    utmCampaign: string | null
    referrerDomain: string | null
    trackingLinkName: string | null
    candidateFirstName: string
    candidateLastName: string
    candidateEmail: string
    jobTitle: string
    status: string
    appliedAt: string
  }[]
  topReferrerDomains: { domain: string | null; count: number }[]
  summary: {
    totalTracked: number
    totalUntracked: number
    attributionRate: number
  }
}

export function useSourceTracking(options?: {
  jobId?: Ref<string | undefined> | string
  from?: Ref<string | undefined> | string
  to?: Ref<string | undefined> | string
}) {
  const jobId = computed(() => toValue(options?.jobId))
  const from = computed(() => toValue(options?.from))
  const to = computed(() => toValue(options?.to))

  const statsQuery = computed(() => {
    const query: Record<string, string> = {}
    if (jobId.value) query.jobId = jobId.value
    if (from.value) query.from = from.value
    if (to.value) query.to = to.value
    return query
  })

  const statsKey = computed(() => {
    const parts = ['source-tracking-stats']
    for (const [key, value] of Object.entries(statsQuery.value)) {
      parts.push(`${key}:${value}`)
    }
    return parts.join('-')
  })

  const {
    data: stats,
    status: statsStatus,
    error: statsError,
    refresh: refreshStats,
  } = useFetch<SourceStats>('/api/source-tracking/stats', {
    key: statsKey,
    headers: useRequestHeaders(['cookie']),
    query: statsQuery,
  })

  const channelBreakdown = computed(() => stats.value?.channelBreakdown ?? [])
  const topLinks = computed(() => stats.value?.topLinks ?? [])
  const funnel = computed(() => stats.value?.funnel ?? {})
  const dailyTrend = computed(() => stats.value?.dailyTrend ?? [])
  const recentAttributed = computed(() => stats.value?.recentAttributed ?? [])
  const topReferrerDomains = computed(() => stats.value?.topReferrerDomains ?? [])
  const summary = computed(() => stats.value?.summary ?? { totalTracked: 0, totalUntracked: 0, attributionRate: 0 })

  return {
    channelBreakdown,
    topLinks,
    funnel,
    dailyTrend,
    recentAttributed,
    topReferrerDomains,
    summary,
    statsStatus,
    statsError,
    refreshStats,
  }
}

/**
 * Composable for managing tracking links (CRUD operations).
 */
export function useTrackingLinks(options?: {
  jobId?: Ref<string | undefined> | string
  channel?: Ref<string | undefined> | string
}) {
  const toast = useToast()

  const jobId = computed(() => toValue(options?.jobId))
  const channel = computed(() => toValue(options?.channel))

  const fetchKey = computed(() => {
    const parts = ['tracking-links']
    if (jobId.value) parts.push(jobId.value)
    if (channel.value) parts.push(channel.value)
    return parts.join(':')
  })

  const linksQuery = computed(() => {
    const query: Record<string, string> = {}
    if (jobId.value) query.jobId = jobId.value
    if (channel.value) query.channel = channel.value
    return query
  })

  const {
    data,
    status: fetchStatus,
    error,
    refresh,
  } = useFetch<{ data: TrackingLink[]; total: number }>('/api/tracking-links', {
    key: fetchKey,
    headers: useRequestHeaders(['cookie']),
    query: linksQuery,
    // 45s SWR for source-tracking links (heavy dashboard page)
    getCachedData(key, nuxtApp) {
      const cached = nuxtApp.payload.data[key]
      if (!cached) return undefined
      const fetchedAt = (cached as any)._fetchedAt || 0
      if (Date.now() - fetchedAt < 45_000) return cached
      return cached
    },
  })

  if (import.meta.client) {
    watch(data, (val) => {
      if (val && !(val as any)._fetchedAt) (val as any)._fetchedAt = Date.now()
    }, { immediate: true })
  }

  const links = computed<TrackingLink[]>(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  async function createLink(payload: {
    jobId?: string
    channel?: string
    name: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmTerm?: string
    utmContent?: string
  }) {
    const created = await $fetch('/api/tracking-links', {
      method: 'POST',
      body: payload,
    })
    clearNuxtData(fetchKey.value)
    await refresh()
    toast.success('Tracking link created')
    return created
  }

  async function updateLink(id: string, payload: {
    name?: string
    channel?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmTerm?: string
    utmContent?: string
    isActive?: boolean
  }) {
    const updated = await $fetch(`/api/tracking-links/${id}`, {
      method: 'PATCH',
      body: payload,
    })
    clearNuxtData(fetchKey.value)
    await refresh()
    return updated
  }

  async function deleteLink(id: string) {
    await $fetch(`/api/tracking-links/${id}`, { method: 'DELETE' })
    clearNuxtData(fetchKey.value)
    await refresh()
    toast.success('Tracking link deleted')
  }

  async function toggleLink(id: string, isActive: boolean) {
    await updateLink(id, { isActive })
    toast.success(isActive ? 'Link activated' : 'Link deactivated')
  }

  return {
    links,
    total,
    fetchStatus,
    error,
    refresh,
    createLink,
    updateLink,
    deleteLink,
    toggleLink,
  }
}
