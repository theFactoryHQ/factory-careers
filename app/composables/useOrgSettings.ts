import type { ScoringBand } from '~~/shared/scoring-bands'

/**
 * Composable for fetching and updating organization localization settings.
 * Provides reactive settings and a utility for formatting candidate names/dates.
 */
export function useOrgSettings() {
  const { data, status, refresh } = useFetch('/api/org-settings', {
    key: 'org-settings',
    headers: useRequestHeaders(['cookie']),
    getCachedData: getSwrCachedData,
  })

  watchFetchSwrStamp(data)

  const nameDisplayFormat = computed(() => data.value?.nameDisplayFormat ?? 'first_last')
  const dateFormat = computed(() => data.value?.dateFormat ?? 'mdy')
  const defaultSalaryUnit = computed(() => data.value?.defaultSalaryUnit ?? 'YEAR')
  const analysisContext = computed(() => data.value?.analysisContext ?? '')
  const scoringBands = computed<ScoringBand[]>(() => data.value?.scoringBands ?? [])
  const signupAllowedDomains = computed(() => data.value?.signupAllowedDomains ?? [])
  const sendApplicationAcknowledgement = computed(() => data.value?.sendApplicationAcknowledgement ?? true)
  const applicationAcknowledgementTemplateId = computed(() => data.value?.applicationAcknowledgementTemplateId ?? null)
  const applicationAcknowledgementDelayMinutes = computed(() => data.value?.applicationAcknowledgementDelayMinutes ?? 0)
  const applicationAcknowledgementBusinessHoursOnly = computed(() => data.value?.applicationAcknowledgementBusinessHoursOnly ?? false)
  const sendApplicationRejection = computed(() => data.value?.sendApplicationRejection ?? false)
  const applicationRejectionTemplateId = computed(() => data.value?.applicationRejectionTemplateId ?? null)
  const applicationRejectionDelayMinutes = computed(() => data.value?.applicationRejectionDelayMinutes ?? 0)
  const applicationRejectionBusinessHoursOnly = computed(() => data.value?.applicationRejectionBusinessHoursOnly ?? false)
  const interviewInvitationTemplateId = computed(() => data.value?.interviewInvitationTemplateId ?? null)
  const emailBusinessHoursTimezone = computed(() => data.value?.emailBusinessHoursTimezone ?? 'America/New_York')
  const emailBusinessHoursStartHour = computed(() => data.value?.emailBusinessHoursStartHour ?? 9)
  const emailBusinessHoursEndHour = computed(() => data.value?.emailBusinessHoursEndHour ?? 17)

  /**
   * Format a candidate's full name according to the org's display preference.
   * Falls back to "First Last" if displayName is not set.
   */
  function formatCandidateName(candidate: {
    firstName?: string | null
    lastName?: string | null
    displayName?: string | null
  }): string {
    if (candidate.displayName?.trim()) return candidate.displayName.trim()
    return formatPersonName(candidate.firstName, candidate.lastName)
  }

  /**
   * Format a person's name from first/last parts according to the org's
   * display preference. Use for shapes that don't carry a `displayName`
   * (e.g. flattened API rows like `candidateFirstName` / `candidateLastName`).
   */
  function formatPersonName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    displayName?: string | null
  ): string {
    if (displayName?.trim()) return displayName.trim()
    const first = (firstName ?? '').trim()
    const last = (lastName ?? '').trim()
    if (!first && !last) return ''
    if (!first) return last
    if (!last) return first
    if (nameDisplayFormat.value === 'last_first') {
      return `${last} ${first}`
    }
    return `${first} ${last}`
  }

  /**
   * Format a full ISO timestamp (or Date) according to the org's date format.
   * Returns an empty string for null/undefined values.
   */
  function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return ''
    const iso = typeof value === 'string' ? value : value.toISOString()
    return formatDate(iso.slice(0, 10))
  }

  /**
   * Format a date string (YYYY-MM-DD) according to the org's date format setting.
   * Returns an empty string for null/undefined values.
   */
  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    if (!year || !month || !day) return dateStr
    switch (dateFormat.value) {
      case 'dmy': return `${day}/${month}/${year}`
      case 'ymd': return `${year}-${month}-${day}`
      case 'mdy':
      default: return `${month}/${day}/${year}`
    }
  }

  async function updateSettings(payload: {
    nameDisplayFormat?: 'first_last' | 'last_first'
    dateFormat?: 'mdy' | 'dmy' | 'ymd'
    defaultSalaryUnit?: 'YEAR' | 'MONTH' | 'HOUR'
    analysisContext?: string
    scoringBands?: ScoringBand[]
    signupAllowedDomains?: string[]
    sendApplicationAcknowledgement?: boolean
    applicationAcknowledgementTemplateId?: string | null
    applicationAcknowledgementDelayMinutes?: number
    applicationAcknowledgementBusinessHoursOnly?: boolean
    sendApplicationRejection?: boolean
    applicationRejectionTemplateId?: string | null
    applicationRejectionDelayMinutes?: number
    applicationRejectionBusinessHoursOnly?: boolean
    interviewInvitationTemplateId?: string | null
    emailBusinessHoursTimezone?: string
    emailBusinessHoursStartHour?: number
    emailBusinessHoursEndHour?: number
  }) {
    await $fetch('/api/org-settings', {
      method: 'PATCH',
      body: payload,
    })
    await refresh()
  }

  return {
    nameDisplayFormat,
    dateFormat,
    defaultSalaryUnit,
    analysisContext,
    scoringBands,
    signupAllowedDomains,
    sendApplicationAcknowledgement,
    applicationAcknowledgementTemplateId,
    applicationAcknowledgementDelayMinutes,
    applicationAcknowledgementBusinessHoursOnly,
    sendApplicationRejection,
    applicationRejectionTemplateId,
    applicationRejectionDelayMinutes,
    applicationRejectionBusinessHoursOnly,
    interviewInvitationTemplateId,
    emailBusinessHoursTimezone,
    emailBusinessHoursStartHour,
    emailBusinessHoursEndHour,
    status,
    formatCandidateName,
    formatPersonName,
    formatDate,
    formatDateTime,
    updateSettings,
    refresh,
  }
}
