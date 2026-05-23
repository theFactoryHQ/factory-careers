/**
 * Composable for managing calendar integration status.
 * Provides connection state, connect/disconnect actions.
 */
export interface CalendarStatus {
  available: boolean
  availableProvider: 'google' | 'microsoft' | null
  authMode: 'delegated' | 'application' | null
  managedByAdmin: boolean
  expectedAccountEmail: string | null
  destinations: Array<{
    type: 'shared_mailbox' | 'user_mailbox'
    email: string
    isPrimary: boolean
  }>
  syncInterviewers: boolean
  connectionScope: 'organization' | 'user' | null
  connected: boolean
  provider: 'google' | 'microsoft' | null
  providerLabel: string | null
  accountEmail: string | null
  calendarId: string | null
  webhookActive: boolean
  connectedAt?: string
}

export function useCalendarIntegration() {
  const { data, status, error, refresh } = useFetch<CalendarStatus>('/api/calendar/status', {
    key: 'calendar-status',
    headers: useRequestHeaders(['cookie']),
  })

  const calendarStatus = computed<CalendarStatus>(() => data.value ?? {
    available: false,
    availableProvider: null,
    authMode: null,
    managedByAdmin: false,
    expectedAccountEmail: null,
    destinations: [],
    syncInterviewers: false,
    connectionScope: null,
    connected: false,
    provider: null,
    providerLabel: null,
    accountEmail: null,
    calendarId: null,
    webhookActive: false,
  })

  const isConnected = computed(() => calendarStatus.value.connected)
  const isAvailable = computed(() => calendarStatus.value.available)

  function connect() {
    if (calendarStatus.value.managedByAdmin) return
    // Navigate to the OAuth2 connect endpoint (server-side redirect)
    const provider = calendarStatus.value.availableProvider ?? 'microsoft'
    navigateTo(`/api/calendar/${provider}/connect`, { external: true })
  }

  async function disconnect() {
    await $fetch('/api/calendar/disconnect', { method: 'POST' })
    await refresh()
  }

  return {
    calendarStatus,
    isConnected,
    isAvailable,
    status,
    error,
    refresh,
    connect,
    disconnect,
  }
}
