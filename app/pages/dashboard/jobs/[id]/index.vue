<script setup lang="ts">
import {
  ArrowLeft, ArrowRight, Briefcase, Calendar, Clock, Hash, UserRound, MessageSquare,
  FileText, Download, Phone, ExternalLink,
  Pencil, Globe, ChevronDown, X,
  Video, Building2, Code2, UsersRound, Save, Check, MapPin, Users, Plus,
  CheckCircle2, XCircle, AlertTriangle, ArrowUpDown, ListFilter,
  Maximize2, Minimize2, Brain, History, SlidersHorizontal,
} from 'lucide-vue-next'
import type { PropertyEntry, PropertyFilter } from '~~/shared/properties'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'
import { APPLICATION_STATUS_TRANSITIONS, INTERVIEW_STATUS_TRANSITIONS } from '~~/shared/status-transitions'
import {
  formatRelativeTime,
  getApplicationStatusBadgeClass,
  getApplicationTransitionLabel,
  getInterviewStatusBadgeClass,
  getScoreBadgeClass,
  getScoreTextClass,
} from '~/utils/status-display'
import { formatPhoneNumber } from '~/utils/phone-format'
import { jobPipelineLazyPanels } from '~/utils/job-pipeline-lazy-panels'
import { cacheApplicationDetail, resolveApplicationDetail } from '~/utils/application-detail-cache'

const JobPipelineAiScorePanel = jobPipelineLazyPanels.aiScore
const JobPipelineDocumentsPanel = jobPipelineLazyPanels.documents
const JobPipelineResponsesPanel = jobPipelineLazyPanels.responses
const JobPipelineTimelinePanel = jobPipelineLazyPanels.timeline

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { track } = useTrack()
const toast = useToast()
const { formatPersonName } = useOrgSettings()

// ─────────────────────────────────────────────
// Job data (with update/delete support)
// ─────────────────────────────────────────────

const { job: jobData, status: jobFetchStatus, error: jobError } = useJob(jobId)

// ─────────────────────────────────────────────
// Applications data
// ─────────────────────────────────────────────

const applicationSearch = ref('')
const normalizedApplicationSearch = computed(() => applicationSearch.value.trim())
const isApplicationSearchTooShort = computed(() =>
  normalizedApplicationSearch.value.length > 0
  && normalizedApplicationSearch.value.length < 3,
)
const debouncedApplicationSearch = useDebouncedRef(applicationSearch, {
  delay: 300,
  transform: (value) => {
    const normalized = value.trim()
    return normalized.length >= 3 ? normalized : undefined
  },
  initial: undefined as string | undefined,
})

const {
  data: applicationsData,
  applications,
  total: applicationTotal,
  fetchStatus: appFetchStatus,
  error: appError,
  refresh: refreshApps,
} = useApplications({ jobId, limit: 100, search: debouncedApplicationSearch, allPages: true })

const PIPELINE_STATUSES = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const
type PipelineStatus = typeof PIPELINE_STATUSES[number]

// Read initial pipeline stage from URL query param (?stage=screening)
const initialStage = PIPELINE_STATUSES.includes(route.query.stage as any)
  ? (route.query.stage as PipelineStatus)
  : 'new'
const focusStatus = ref<PipelineStatus>(initialStage)

const focusedApplications = computed(() =>
  applications.value.filter((application) => application.status === focusStatus.value),
)

// Narrow candidate-only search lives alongside the other focused-list filters.
const candidateSearch = ref('')

// ─────────────────────────────────────────────
// Filters & Sorting
// ─────────────────────────────────────────────

type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'score-desc' | 'score-asc' | 'updated-desc'
type ScoreFilter = 'all' | 'high' | 'medium' | 'low' | 'none'
type InterviewFilter = 'all' | 'has-interview' | 'no-interview'

const sortBy = ref<SortOption>('score-desc')
const scoreFilter = ref<ScoreFilter>('all')
const interviewFilter = ref<InterviewFilter>('all')
const propertyFilters = ref<PropertyFilter[]>([])
const showSortPanel = ref(false)
const showFilterPanel = ref(false)
const sortTriggerRef = ref<HTMLElement | null>(null)
const sortPanelRef = ref<HTMLElement | null>(null)
const { floatingStyle: sortPanelStyle } = useFloatingMenu({
  open: showSortPanel,
  triggerRef: sortTriggerRef,
  width: 'trigger',
  estimatedHeight: 260,
  zIndex: 80,
})

const hasActiveFilters = computed(() =>
  candidateSearch.value.trim().length > 0
  || scoreFilter.value !== 'all'
  || interviewFilter.value !== 'all'
  || propertyFilters.value.length > 0,
)
const activeFilterCount = computed(() => {
  let count = 0
  if (candidateSearch.value.trim()) count++
  if (scoreFilter.value !== 'all') count++
  if (interviewFilter.value !== 'all') count++
  count += propertyFilters.value.length
  return count
})

function clearFilters() {
  candidateSearch.value = ''
  scoreFilter.value = 'all'
  interviewFilter.value = 'all'
  propertyFilters.value = []
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A \u2192 Z' },
  { value: 'name-desc', label: 'Name Z \u2192 A' },
  { value: 'score-desc', label: 'Highest score' },
  { value: 'score-asc', label: 'Lowest score' },
  { value: 'updated-desc', label: 'Recently updated' },
]

const currentSortLabel = computed(() =>
  sortOptions.find(o => o.value === sortBy.value)?.label ?? 'Sort',
)

const scoreFilterOptions: { value: ScoreFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'high', label: '75+' },
  { value: 'medium', label: '40\u201374' },
  { value: 'low', label: '< 40' },
  { value: 'none', label: 'No score' },
]

const interviewFilterOptions: { value: InterviewFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'has-interview', label: 'Scheduled' },
  { value: 'no-interview', label: 'None' },
]

function selectSort(option: SortOption) {
  sortBy.value = option
  showSortPanel.value = false
}

function closePanels() {
  showSortPanel.value = false
  showFilterPanel.value = false
}

const filteredApplications = computed(() => {
  let result = focusedApplications.value

  // Candidate-only filter. The page-level application search is handled by the API.
  if (candidateSearch.value.trim()) {
    const term = candidateSearch.value.trim().toLowerCase()
    result = result.filter((app) => {
      const name = `${app.candidateFirstName} ${app.candidateLastName}`.toLowerCase()
      const email = (app.candidateEmail ?? '').toLowerCase()
      return name.includes(term) || email.includes(term)
    })
  }

  // Score filter
  if (scoreFilter.value !== 'all') {
    result = result.filter((app) => {
      switch (scoreFilter.value) {
        case 'high': return app.score != null && app.score >= 75
        case 'medium': return app.score != null && app.score >= 40 && app.score < 75
        case 'low': return app.score != null && app.score < 40
        case 'none': return app.score == null
        default: return true
      }
    })
  }

  // Interview filter
  if (interviewFilter.value !== 'all') {
    result = result.filter((app) => {
      const hasInterview = applicationsWithInterviews.value.has(app.id)
      return interviewFilter.value === 'has-interview' ? hasInterview : !hasInterview
    })
  }

  // Property filters
  if (propertyFilters.value.length > 0) {
    result = result.filter((app) => {
      const props = (app as any).properties as PropertyEntry[] | undefined ?? []
      return propertyFilters.value.every((pf) => {
        const entry = props.find((e) => e.definition.id === pf.propertyDefinitionId)
        const val = entry?.value ?? null
        switch (pf.op) {
          case 'isEmpty': return val === null || val === '' || (Array.isArray(val) && val.length === 0)
          case 'isNotEmpty': return val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)
          case 'equals': return String(val ?? '') === String(pf.value ?? '')
          case 'contains': return String(val ?? '').toLowerCase().includes(String(pf.value ?? '').toLowerCase())
          case 'in': return Array.isArray(pf.value) && Array.isArray(val)
            ? (pf.value as string[]).some((v) => (val as string[]).includes(v))
            : Array.isArray(pf.value) && (pf.value as string[]).includes(String(val ?? ''))
          default: return true
        }
      })
    })
  }
  return [...result].sort((a, b) => {
    switch (sortBy.value) {
      case 'date-desc':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'date-asc':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case 'name-asc': {
        const nameA = `${a.candidateFirstName} ${a.candidateLastName}`.toLowerCase()
        const nameB = `${b.candidateFirstName} ${b.candidateLastName}`.toLowerCase()
        return nameA.localeCompare(nameB)
      }
      case 'name-desc': {
        const nameA = `${a.candidateFirstName} ${a.candidateLastName}`.toLowerCase()
        const nameB = `${b.candidateFirstName} ${b.candidateLastName}`.toLowerCase()
        return nameB.localeCompare(nameA)
      }
      case 'score-desc':
        return (b.score ?? -1) - (a.score ?? -1)
      case 'score-asc':
        return (a.score ?? -1) - (b.score ?? -1)
      case 'updated-desc':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      default:
        return 0
    }
  })
})

type StatusCountMap = {
  new: number
  screening: number
  interview: number
  offer: number
  hired: number
  rejected: number
}

const statusCounts = computed(() => {
  const counts: StatusCountMap = { new: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 }
  for (const application of applications.value) {
    if (application.status in counts) {
      counts[application.status as PipelineStatus] += 1
    }
  }
  return counts
})

const currentIndex = ref(0)

// Mobile: toggle between candidate list and detail view
const showMobileDetail = ref(false)

watch(focusedApplications, () => {
  if (focusedApplications.value.length === 0) {
    currentIndex.value = 0
    return
  }
  if (currentIndex.value >= focusedApplications.value.length) {
    currentIndex.value = focusedApplications.value.length - 1
  }
}, { immediate: true })

// Also clamp when property/score/interview filters change and shrink filteredApplications
watch(filteredApplications, (apps) => {
  if (apps.length === 0) {
    currentIndex.value = 0
    return
  }
  if (currentIndex.value >= apps.length) {
    currentIndex.value = apps.length - 1
  }
})

watch(focusStatus, () => {
  currentIndex.value = 0
  propertyFilters.value = []
  closePanels()
})

// Auto-scroll mobile bottom bar to keep selected candidate visible
watch(currentIndex, () => {
  nextTick(() => {
    const container = mobileBottomBar.value
    if (!container) return
    const selected = container.querySelector(`[data-candidate-idx="${currentIndex.value}"]`) as HTMLElement | null
    selected?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  })
})

const currentSummary = computed(() => filteredApplications.value[currentIndex.value] ?? null)

// Detail tab for center panel
type DetailTab = 'overview' | 'interviews' | 'documents' | 'responses' | 'ai-analysis' | 'timeline' | 'properties'
const detailTab = ref<DetailTab>('overview')

// Defer heavy overview sections until idle or the user opens a dedicated tab
const overviewHeavyReady = ref(false)

function scheduleOverviewHeavy() {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      overviewHeavyReady.value = true
    }, { timeout: 2000 })
    return
  }

  setTimeout(() => {
    overviewHeavyReady.value = true
  }, 0)
}

onMounted(() => {
  scheduleOverviewHeavy()
})

watch(detailTab, (tab) => {
  if (tab !== 'overview') {
    overviewHeavyReady.value = true
  }
})

const showOverviewHeavy = computed(() =>
  detailTab.value !== 'overview' || overviewHeavyReady.value,
)

// Which sections to display based on active tab
const showSection = computed(() => ({
  profile: detailTab.value === 'overview',
  aiAnalysis: detailTab.value === 'ai-analysis' || (detailTab.value === 'overview' && showOverviewHeavy.value),
  interviews: detailTab.value === 'interviews' || (detailTab.value === 'overview' && showOverviewHeavy.value),
  documents: detailTab.value === 'documents' || (detailTab.value === 'overview' && showOverviewHeavy.value),
  responses: detailTab.value === 'responses' || (detailTab.value === 'overview' && showOverviewHeavy.value),
  properties: detailTab.value === 'overview' || detailTab.value === 'properties',
  timeline: detailTab.value === 'timeline',
}))

// Section refs
const overviewRef = ref<HTMLElement | null>(null)
const interviewsRef = ref<HTMLElement | null>(null)
const documentsRef = ref<HTMLElement | null>(null)
const responsesRef = ref<HTMLElement | null>(null)
const detailScrollContainer = ref<HTMLElement | null>(null)
const mobileBottomBar = ref<HTMLElement | null>(null)

type SwipeDocument = {
  id: string
  type: 'resume' | 'cover_letter' | 'other'
  originalFilename: string
  mimeType: string
  createdAt: string | Date
}

type SwipeResponse = {
  id: string
  value: unknown
  question: {
    id: string
    label: string
    type: string
    options: string[] | null
  } | null
}

type SwipeApplicationDetail = {
  id: string
  status: string
  score: number | null
  notes: string | null
  createdAt: string | Date
  updatedAt: string | Date
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    documents: SwipeDocument[]
  }
  responses: SwipeResponse[]
  properties: PropertyEntry[]
}

type CachedApplicationDetail = {
  applicationId: string
  data: SwipeApplicationDetail
}

const currentApplicationId = ref('')

watch(currentSummary, (summary) => {
  if (!summary?.id) return
  currentApplicationId.value = summary.id
}, { immediate: true })

const {
  data: currentApplication,
  execute: executeDetailFetch,
} = useFetch<SwipeApplicationDetail | null>(
  () => `/api/applications/${currentApplicationId.value}`,
  {
    key: computed(() => `pipeline-application-${currentApplicationId.value}`),
    immediate: false,
    watch: false,
    headers: useRequestHeaders(['cookie']),
  },
)

const cachedApplication = ref<CachedApplicationDetail | null>(null)

const resolvedCurrentApplication = computed(() => resolveApplicationDetail(
  currentApplicationId.value,
  currentApplication.value,
  cachedApplication.value,
))

watch(currentApplication, (val) => {
  if (!val) return
  cachedApplication.value = cacheApplicationDetail(currentApplicationId.value, val)
})

watch(currentApplicationId, async (id) => {
  if (cachedApplication.value?.applicationId !== currentApplicationId.value) {
    cachedApplication.value = null
  }
  if (!id) return
  await executeDetailFetch()
}, { immediate: true })

useSeoMeta({
  title: computed(() =>
    jobData.value ? `Pipeline — ${jobData.value.title} — Factory Careers` : 'Pipeline — Factory Careers',
  ),
  robots: 'noindex, nofollow',
})

function formatStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getCandidateInitials(firstName?: string, lastName?: string) {
  const first = firstName?.trim().charAt(0) ?? ''
  const last = lastName?.trim().charAt(0) ?? ''
  return `${first}${last}`.toUpperCase() || 'C'
}

const allowedTransitions = computed(() => {
  if (!resolvedCurrentApplication.value) return []
  if (!currentSummary.value || currentSummary.value.id !== resolvedCurrentApplication.value.id) return []
  return APPLICATION_STATUS_TRANSITIONS[currentSummary.value.status] ?? []
})

function isCurrentStatus(status: string) {
  return currentSummary.value?.status === status
}

function isStatusActionEnabled(status: string) {
  if (!currentSummary.value) return false
  if (isCurrentStatus(status)) return false
  return allowedTransitions.value.includes(status)
}

function isFocusStatus(status: PipelineStatus) {
  return focusStatus.value === status
}

function setFocusStatus(status: PipelineStatus) {
  focusStatus.value = status
}

function selectCandidate(index: number) {
  currentIndex.value = index
  showMobileDetail.value = true
}

const isMutating = ref(false)

// ─────────────────────────────────────────────
// Interview scheduling sidebar
// ─────────────────────────────────────────────

const showInterviewSidebar = ref(false)
const interviewTargetApplication = ref<{ id: string; name: string; status: string } | null>(null)

function openInterviewScheduler() {
  if (!resolvedCurrentApplication.value || !currentSummary.value) return
  if (resolvedCurrentApplication.value.id !== currentSummary.value.id) return
  interviewTargetApplication.value = {
    id: currentSummary.value.id,
    name: `${currentSummary.value.candidateFirstName} ${currentSummary.value.candidateLastName}`,
    status: currentSummary.value.status,
  }
  showInterviewSidebar.value = true
}

async function handleInterviewScheduled() {
  const scheduledTarget = interviewTargetApplication.value
  showInterviewSidebar.value = false
  interviewTargetApplication.value = null

  track('interview_scheduled')

  // Refresh the interviews list
  await refreshJobInterviews()

  // Transition the application status to 'interview' after scheduling
  if (scheduledTarget && scheduledTarget.status !== 'interview') {
    const allowed = APPLICATION_STATUS_TRANSITIONS[scheduledTarget.status] ?? []
    if (allowed.includes('interview')) {
      await changeApplicationStatus(scheduledTarget.id, 'interview', scheduledTarget.status)

      // Follow the candidate to the interview column so the user sees the scheduled interview
      focusStatus.value = 'interview'
      await nextTick()
      const idx = filteredApplications.value.findIndex(a => a.id === scheduledTarget.id)
      if (idx !== -1) currentIndex.value = idx
    }
  }
}

// ─────────────────────────────────────────────
// Interviews for this job
// ─────────────────────────────────────────────

const jobInterviewsFetchStarted = ref(false)

const {
  data: jobInterviewsData,
  error: jobInterviewsError,
  refresh: refreshJobInterviews,
  execute: executeJobInterviewsFetch,
} = useFetch<{ data: Interview[] }>('/api/interviews', {
  key: `pipeline-job-interviews-${jobId}`,
  query: { jobId, limit: 100 },
  headers: useRequestHeaders(['cookie']),
  immediate: false,
  watch: false,
})

async function ensureJobInterviewsLoaded() {
  if (jobInterviewsFetchStarted.value) return
  jobInterviewsFetchStarted.value = true
  await executeJobInterviewsFetch()
  if (jobInterviewsError.value) {
    jobInterviewsFetchStarted.value = false
  }
}

watch(() => showSection.value.interviews, (show) => {
  if (show) void ensureJobInterviewsLoaded()
}, { immediate: true })

watch(interviewFilter, (filter) => {
  if (filter !== 'all') void ensureJobInterviewsLoaded()
})

const jobInterviews = computed(() => jobInterviewsData.value?.data ?? [])

const currentApplicationInterviews = computed(() =>
  jobInterviews.value.filter(i => i.applicationId === currentApplicationId.value),
)

const applicationsWithInterviews = computed(() =>
  new Set(jobInterviews.value.map(i => i.applicationId)),
)

const interviewTypeIcons: Record<string, any> = {
  video: Video,
  phone: Phone,
  in_person: Building2,
  technical: Code2,
  panel: UsersRound,
  take_home: FileText,
}

const interviewTypeLabels: Record<string, string> = {
  video: 'Video',
  phone: 'Phone',
  in_person: 'In Person',
  technical: 'Technical',
  panel: 'Panel',
  take_home: 'Take Home',
}

function formatInterviewDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    + ' at '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatInterviewDateTimeFull(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function isInterviewUpcoming(dateStr: string) {
  return new Date(dateStr) > new Date()
}

// ─────────────────────────────────────────────
// Interview inline editing
// ─────────────────────────────────────────────

type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

function getAllowedInterviewTransitions(status: string): InterviewStatus[] {
  return (INTERVIEW_STATUS_TRANSITIONS[status] ?? []) as InterviewStatus[]
}

const interviewTransitionClasses: Record<InterviewStatus, string> = {
  scheduled: 'border border-surface-300 dark:border-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800',
  completed: 'bg-success-600 text-white hover:bg-success-700',
  cancelled: 'bg-surface-500 text-white hover:bg-surface-600',
  no_show: 'bg-danger-600 text-white hover:bg-danger-700',
}

const interviewTransitionLabels: Record<InterviewStatus, string> = {
  scheduled: 'Re-schedule',
  completed: 'Completed',
  cancelled: 'Cancel',
  no_show: 'No Show',
}

const interviewStatusIcons: Record<InterviewStatus, any> = {
  scheduled: Calendar,
  completed: CheckCircle2,
  cancelled: XCircle,
  no_show: AlertTriangle,
}

const expandedInterviewId = ref<string | null>(null)
const editingInterviewId = ref<string | null>(null)
const interviewEditForm = reactive({
  title: '',
  type: 'video' as string,
  location: '',
  notes: '',
  interviewers: [''] as string[],
})
const interviewEditErrors = ref<Record<string, string>>({})
const isInterviewSaving = ref(false)
const isInterviewTransitioning = ref(false)

// Reschedule state
const rescheduleInterviewId = ref<string | null>(null)
const rescheduleForm = reactive({
  date: '',
  time: '',
  duration: 60,
})
const isRescheduling = ref(false)

function toggleInterviewExpand(id: string) {
  if (expandedInterviewId.value === id) {
    expandedInterviewId.value = null
    editingInterviewId.value = null
    rescheduleInterviewId.value = null
  } else {
    expandedInterviewId.value = id
    editingInterviewId.value = null
    rescheduleInterviewId.value = null
  }
}

function startInterviewEdit(iv: Interview) {
  editingInterviewId.value = iv.id
  interviewEditForm.title = iv.title
  interviewEditForm.type = iv.type
  interviewEditForm.location = iv.location ?? ''
  interviewEditForm.notes = iv.notes ?? ''
  interviewEditForm.interviewers = iv.interviewers?.length ? [...iv.interviewers] : ['']
  interviewEditErrors.value = {}
}

function cancelInterviewEdit() {
  editingInterviewId.value = null
  interviewEditErrors.value = {}
}

function addEditInterviewer() {
  interviewEditForm.interviewers.push('')
}

function removeEditInterviewer(idx: number) {
  interviewEditForm.interviewers.splice(idx, 1)
}

async function saveInterviewEdit() {
  interviewEditErrors.value = {}
  if (!interviewEditForm.title.trim()) {
    interviewEditErrors.value.title = 'Title is required'
    return
  }

  isInterviewSaving.value = true
  try {
    const filteredInterviewers = interviewEditForm.interviewers.filter(i => i.trim())
    await $fetch(`/api/interviews/${editingInterviewId.value}`, {
      method: 'PATCH',
      body: {
        title: interviewEditForm.title.trim(),
        type: interviewEditForm.type,
        location: interviewEditForm.location.trim() || null,
        notes: interviewEditForm.notes.trim() || null,
        interviewers: filteredInterviewers.length > 0 ? filteredInterviewers : null,
      },
    })
    editingInterviewId.value = null
    await refreshJobInterviews()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save changes', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isInterviewSaving.value = false
  }
}

async function handleInterviewTransition(interviewId: string, newStatus: InterviewStatus) {
  isInterviewTransitioning.value = true
  try {
    await $fetch(`/api/interviews/${interviewId}`, {
      method: 'PATCH',
      body: { status: newStatus },
    })
    await refreshJobInterviews()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isInterviewTransitioning.value = false
  }
}

function openReschedule(iv: Interview) {
  rescheduleInterviewId.value = iv.id
  const d = new Date(iv.scheduledAt)
  rescheduleForm.date = d.toISOString().slice(0, 10)
  rescheduleForm.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  rescheduleForm.duration = iv.duration
}

function cancelReschedule() {
  rescheduleInterviewId.value = null
}

async function handleReschedule() {
  if (!rescheduleForm.date || !rescheduleForm.time) {
    toast.error('Date and time required')
    return
  }

  isRescheduling.value = true
  try {
    const scheduledAt = new Date(`${rescheduleForm.date}T${rescheduleForm.time}`).toISOString()
    await $fetch(`/api/interviews/${rescheduleInterviewId.value}`, {
      method: 'PATCH',
      body: {
        scheduledAt,
        duration: rescheduleForm.duration,
        status: 'scheduled',
      },
    })
    rescheduleInterviewId.value = null
    await refreshJobInterviews()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to reschedule', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isRescheduling.value = false
  }
}

async function changeApplicationStatus(applicationId: string, status: string, fromStatus: string) {
  if (isMutating.value) return
  isMutating.value = true

  try {
    await $fetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      body: { status },
    })

    track('pipeline_stage_changed', {
      from_stage: fromStatus,
      to_stage: status,
    })

    await refreshApps()

    // After the moved candidate disappears from the list, the items that came after
    // it shift up by one index. currentIndex now naturally points to the next
    // candidate — no change needed. We only clamp if currentIndex is now out of
    // bounds (i.e. the moved candidate was the last item in the filtered list).
    const newLen = filteredApplications.value.length
    if (newLen > 0 && currentIndex.value >= newLen) {
      currentIndex.value = newLen - 1
    }
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isMutating.value = false
  }
}

async function changeStatus(status: string) {
  const detail = resolvedCurrentApplication.value
  const summary = currentSummary.value
  if (!detail || !summary || detail.id !== summary.id) return
  await changeApplicationStatus(detail.id, status, summary.status)
}

function goToPreviousCard() {
  if (currentIndex.value === 0) return
  currentIndex.value -= 1
}

function goToNextCard() {
  if (currentIndex.value >= filteredApplications.value.length - 1) return
  currentIndex.value += 1
}

// ─────────────────────────────────────────────
// Fullscreen (focus) mode
// ─────────────────────────────────────────────
const isFullscreen = ref(false)
const pipelineContainer = useTemplateRef<HTMLElement>('pipelineContainer')
const teleportTarget = computed(() => isFullscreen.value && pipelineContainer.value ? pipelineContainer.value : 'body')

async function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  await nextTick()
}

function goToPreviousStage() {
  const idx = PIPELINE_STATUSES.indexOf(focusStatus.value)
  if (idx > 0) {
    focusStatus.value = PIPELINE_STATUSES[idx - 1]!
  }
}

function goToNextStage() {
  const idx = PIPELINE_STATUSES.indexOf(focusStatus.value)
  if (idx < PIPELINE_STATUSES.length - 1) {
    focusStatus.value = PIPELINE_STATUSES[idx + 1]!
  }
}

function handleKeyNavigation(event: KeyboardEvent) {
  if (event.key === 'Escape' && showDocPreview.value) {
    closeDocPreview()
    return
  }

  if (event.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
    return
  }

  if ((event.target as HTMLElement)?.tagName === 'INPUT' || (event.target as HTMLElement)?.tagName === 'TEXTAREA' || (event.target as HTMLElement)?.tagName === 'SELECT') return

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    goToPreviousCard()
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    goToNextCard()
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goToPreviousStage()
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    goToNextStage()
  }

  // Number keys 1-9 trigger status transition buttons
  const num = parseInt(event.key)
  if (num >= 1 && num <= 9 && allowedTransitions.value.length >= num) {
    event.preventDefault()
    const targetStatus = allowedTransitions.value[num - 1]!
    if (targetStatus === 'interview') {
      openInterviewScheduler()
    } else {
      changeStatus(targetStatus)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyNavigation)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyNavigation)
})

const isLoading = computed(() => {
  return jobFetchStatus.value === 'pending'
    || (appFetchStatus.value === 'pending' && applicationsData.value == null && !debouncedApplicationSearch.value)
})

const isApplicationSearchPending = computed(() =>
  !isApplicationSearchTooShort.value
  && (
    normalizedApplicationSearch.value !== (debouncedApplicationSearch.value ?? '')
    || (appFetchStatus.value === 'pending' && !isMutating.value)
  ),
)

// ─────────────────────────────────────────────
// Document preview
// ─────────────────────────────────────────────

const { getPreviewUrl } = useDocuments()

const showDocPreview = ref(false)
const docPreviewUrl = ref<string | null>(null)
const docPreviewFilename = ref('')
const docPreviewMimeType = ref('')
const docPreviewDocId = ref<string | null>(null)

const isDocPreviewPdf = computed(() => docPreviewMimeType.value === 'application/pdf')

function handleDocPreview(doc: SwipeDocument) {
  track('document_viewed', { document_type: doc.type, mime_type: doc.mimeType })
  if (doc.mimeType !== 'application/pdf') {
    // Non-PDFs: fall back to download
    window.open(`/api/documents/${doc.id}/download`, '_blank')
    return
  }
  docPreviewDocId.value = doc.id
  docPreviewFilename.value = doc.originalFilename
  docPreviewMimeType.value = doc.mimeType
  docPreviewUrl.value = getPreviewUrl(doc.id)
  showDocPreview.value = true
}

function closeDocPreview() {
  showDocPreview.value = false
  docPreviewUrl.value = null
  docPreviewFilename.value = ''
  docPreviewMimeType.value = ''
  docPreviewDocId.value = null
}
</script>

<template>
  <div
    ref="pipelineContainer"
    :class="isFullscreen
      ? 'fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-surface-50 dark:bg-surface-950 factory-dashboard-portal'
      : 'absolute inset-0 flex flex-col overflow-hidden'"
  >
    <!-- Loading -->
    <div v-if="isLoading" class="flex flex-1 flex-col items-center justify-center gap-3">
      <div class="size-8 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin" />
      <p class="text-sm font-medium text-surface-400 dark:text-surface-500">Loading pipeline…</p>
    </div>

    <!-- Error -->
    <div
      v-else-if="jobError || appError"
      class="m-6 rounded-xl border border-danger-200/80 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-800/60 dark:bg-danger-950/40 dark:text-danger-300"
    >
      {{ jobError ? 'Job not found or failed to load.' : 'Failed to load applications.' }}
      <NuxtLink :to="$localePath('/dashboard')" class="ml-1 font-medium underline hover:no-underline">Back to Jobs</NuxtLink>
    </div>

    <template v-else-if="jobData">
      <!-- Quick actions teleported to sub-nav bar -->
      <JobSubNavActions :job-id="jobId" />

      <!-- ═══════════════════════════════════════ -->
      <!-- PIPELINE STATUS TABS                     -->
      <!-- ═══════════════════════════════════════ -->
      <div class="factory-pipeline-stage-strip shrink-0 border-b border-white/10 bg-white/[0.02]">
        <div class="factory-dashboard-tabs flex items-center gap-1.5 overflow-x-auto scrollbar-thin sm:scrollbar-none px-3 sm:px-5 py-1">
          <span class="factory-pipeline-stage-strip-label shrink-0 pr-2 text-xs font-light uppercase leading-none text-white/48">
            Pipeline stages
          </span>
          <button
            v-for="(status, idx) in PIPELINE_STATUSES"
            :key="`tab-${status}`"
            class="ui-filter-chip factory-pipeline-status-chip relative flex h-8 shrink-0 cursor-pointer items-center gap-2 px-3.5 text-xs !font-light uppercase leading-none tracking-normal transition-all duration-200 focus:outline-none"
            :class="[
              isFocusStatus(status) ? 'ui-filter-chip-active factory-pipeline-status-chip-active' : 'ui-filter-chip-inactive',
              `factory-pipeline-status-chip-${status}`,
            ]"
            :title="`${formatStatusLabel(status)} stage ${idx + 1}, ${statusCounts[status] ?? 0} applicants`"
            :aria-label="`${formatStatusLabel(status)} stage ${idx + 1}, ${statusCounts[status] ?? 0} applicants`"
            style="font-weight: 300 !important"
            @click="setFocusStatus(status)"
          >
            <span class="factory-pipeline-status-chip-stage tabular-nums">{{ idx + 1 }}</span>
            <span class="pipeline-status-dot size-2 rounded-full" :class="{
              'bg-blue-500 dark:bg-blue-400': status === 'new',
              'bg-violet-500 dark:bg-violet-400': status === 'screening',
              'bg-amber-500 dark:bg-amber-400': status === 'interview',
              'bg-teal-500 dark:bg-teal-400': status === 'offer',
              'bg-green-600 dark:bg-green-300': status === 'hired',
              'bg-surface-400 dark:bg-surface-500': status === 'rejected',
            }" />
            <span class="factory-pipeline-status-chip-label">{{ formatStatusLabel(status) }}</span>
            <span
              class="factory-pipeline-status-chip-number factory-pipeline-status-chip-count tabular-nums text-xs font-normal transition-colors duration-200"
              :class="isFocusStatus(status)
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-surface-400 dark:text-surface-500'"
            >
              {{ statusCounts[status] ?? 0 }}
            </span>
          </button>

          <!-- Fullscreen toggle -->
          <button
            type="button"
            class="factory-pipeline-fullscreen-button factory-toolbar-button ml-auto inline-flex h-8 min-h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-0 text-sm font-medium transition-colors"
            :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen pipeline'"
            :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen pipeline'"
            @click="toggleFullscreen"
          >
            <Minimize2 v-if="isFullscreen" class="size-4" />
            <Maximize2 v-else class="size-4" />
          </button>
        </div>
      </div>

      <!-- Application-wide content search -->
      <div class="shrink-0 border-b border-white/10 bg-white/[0.015] px-3 py-2 sm:px-5">
        <div class="flex min-w-0 items-center gap-3">
          <GooeySearchInput
            v-model="applicationSearch"
            aria-label="Search application content"
            class="w-full max-w-2xl"
            placeholder="Search applications, resumes, notes, answers…"
            reserve-expanded-space
            size="sm"
            @open-change="closePanels"
          />
          <span
            v-if="isApplicationSearchTooShort"
            class="shrink-0 text-[11px] text-surface-400 dark:text-surface-500"
            role="status"
          >
            Type 3+ characters
          </span>
          <span
            v-else-if="isApplicationSearchPending"
            class="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-surface-400 dark:text-surface-500"
            role="status"
          >
            <span class="size-3 animate-spin rounded-full border border-current border-t-transparent" />
            <span class="hidden sm:inline">Searching</span>
          </span>
          <span
            v-else-if="debouncedApplicationSearch"
            class="shrink-0 text-[11px] tabular-nums text-surface-400 dark:text-surface-500"
          >
            {{ applicationTotal }} match{{ applicationTotal === 1 ? '' : 'es' }}
          </span>
          <span class="hidden shrink-0 text-[10px] text-surface-400 dark:text-surface-500 xl:inline">
            Searches profiles, resumes, answers, properties, interviews, comments, sources, and AI evidence
          </span>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- THREE-PANEL LAYOUT                       -->
      <!-- ═══════════════════════════════════════ -->
      <div class="flex flex-1 min-h-0 overflow-hidden">

        <!-- LEFT PANEL — Candidate list (desktop only; mobile uses bottom bar) -->
        <div
          class="hidden md:flex md:w-72 md:shrink-0 flex-col border-r border-white/10 bg-white/[0.015] ui-dashboard-panel"
        >
          <!-- Sort + Filter controls -->
          <div class="shrink-0 px-3.5 pt-3 pb-2 space-y-2 dark:border-surface-800">
            <!-- Sort & Filter row -->
            <div class="flex items-center gap-1.5">
              <!-- Sort dropdown -->
              <div class="relative flex-1 min-w-0">
                <button
                  ref="sortTriggerRef"
                  class="flex h-8 min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0 text-left transition-all duration-150"
                  :class="showSortPanel
                    ? 'border-brand-300 bg-brand-50/50 text-brand-700 dark:border-brand-600 dark:bg-brand-950/30 dark:text-brand-300'
                    : 'border-surface-200/80 bg-surface-50/50 text-surface-600 hover:border-surface-300 hover:bg-surface-50 dark:border-surface-700/80 dark:bg-surface-800/40 dark:text-surface-300 dark:hover:border-surface-600 dark:hover:bg-surface-800'"
                  @click="showSortPanel = !showSortPanel; showFilterPanel = false"
                >
                  <ArrowUpDown class="size-3 shrink-0" />
                  <span class="truncate text-[11px] font-medium">{{ currentSortLabel }}</span>
                  <ChevronDown class="ml-auto size-3 shrink-0 transition-transform duration-150" :class="showSortPanel ? 'rotate-180' : ''" />
                </button>

                <!-- Sort dropdown panel -->
                <Teleport to="body">
                  <Transition
                    enter-active-class="transition duration-150 ease-out"
                    enter-from-class="opacity-0 scale-95 -translate-y-1"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="transition duration-100 ease-in"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 -translate-y-1"
                  >
                    <div
                      v-if="showSortPanel"
                      ref="sortPanelRef"
                      class="ui-floating-menu factory-dashboard-portal rounded-lg border border-surface-200 bg-white py-1 shadow-lg shadow-surface-900/5 dark:border-surface-700 dark:bg-surface-900 dark:shadow-black/20 origin-top"
                      :style="sortPanelStyle"
                    >
                      <button
                        v-for="option in sortOptions"
                        :key="option.value"
                        class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors"
                        :class="sortBy === option.value
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                          : 'text-surface-600 hover:bg-surface-50 dark:text-surface-300 dark:hover:bg-surface-800'"
                        @click="selectSort(option.value)"
                      >
                        <Check v-if="sortBy === option.value" class="size-3 shrink-0" />
                        <span v-else class="size-3 shrink-0" />
                        {{ option.label }}
                      </button>
                    </div>
                  </Transition>
                </Teleport>
              </div>

              <!-- Filter button -->
              <button
                class="relative flex h-8 min-h-8 cursor-pointer items-center justify-center gap-1 rounded-md border px-2 py-0 transition-all duration-150"
                :aria-expanded="showFilterPanel"
                :aria-label="activeFilterCount > 0 ? `Filter candidates, ${activeFilterCount} active` : 'Filter candidates'"
                :title="activeFilterCount > 0 ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'Filter candidates'"
                :class="showFilterPanel || hasActiveFilters
                  ? 'border-brand-300 bg-brand-50/50 text-brand-700 dark:border-brand-600 dark:bg-brand-950/30 dark:text-brand-300'
                  : 'border-surface-200/80 bg-surface-50/50 text-surface-600 hover:border-surface-300 hover:bg-surface-50 dark:border-surface-700/80 dark:bg-surface-800/40 dark:text-surface-300 dark:hover:border-surface-600 dark:hover:bg-surface-800'"
                @click="showFilterPanel = !showFilterPanel; showSortPanel = false"
              >
                <ListFilter class="size-3" />
                <span
                  v-if="activeFilterCount > 0"
                  class="flex size-3.5 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white dark:bg-brand-500"
                >
                  {{ activeFilterCount }}
                </span>
              </button>
            </div>

            <!-- Filter panel -->
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-1"
            >
              <div
                v-if="showFilterPanel"
                class="rounded-lg border border-white/12 bg-white/[0.025] p-2.5 space-y-2.5"
              >
                <!-- Candidate filter -->
                <div>
                  <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">Candidate</p>
                  <GooeySearchInput
                    v-model="candidateSearch"
                    aria-label="Search candidates"
                    class="w-full"
                    placeholder="Filter by name or email…"
                    reserve-expanded-space
                    size="sm"
                  />
                </div>

                <!-- Score filter -->
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-1">Score</p>
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="opt in scoreFilterOptions"
                      :key="opt.value"
                      class="ui-filter-chip relative flex h-8 shrink-0 cursor-pointer items-center px-2.5 text-xs !font-light uppercase leading-none tracking-normal transition-all duration-200 focus:outline-none"
                      :class="scoreFilter === opt.value
                        ? 'ui-filter-chip-active'
                        : 'ui-filter-chip-inactive'"
                      @click="scoreFilter = opt.value"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <!-- Interview filter -->
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-1">Interview</p>
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="opt in interviewFilterOptions"
                      :key="opt.value"
                      class="ui-filter-chip relative flex h-8 shrink-0 cursor-pointer items-center px-2.5 text-xs !font-light uppercase leading-none tracking-normal transition-all duration-200 focus:outline-none"
                      :class="interviewFilter === opt.value
                        ? 'ui-filter-chip-active'
                        : 'ui-filter-chip-inactive'"
                      @click="interviewFilter = opt.value"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <!-- Property filters -->
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-1.5">Properties</p>
                  <PropertyFilterBar
                    v-model="propertyFilters"
                    entity-type="application"
                    :job-id="jobId"
                  />
                </div>

                <!-- Clear filters -->
                <button
                  v-if="hasActiveFilters"
                  class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200 transition-colors"
                  @click="clearFilters"
                >
                  <X class="size-3" />
                  Clear filters
                </button>
              </div>
            </Transition>
          </div>

          <!-- Count bar -->
          <div class="shrink-0 px-3.5 pb-2 flex items-center justify-between">
            <span class="text-xs font-medium text-surface-500 dark:text-surface-400">
              {{ filteredApplications.length }} candidate{{ filteredApplications.length === 1 ? '' : 's' }}
              <span v-if="debouncedApplicationSearch || hasActiveFilters" class="text-surface-400 dark:text-surface-500">
                {{ hasActiveFilters ? ' filtered' : ' matching' }}
              </span>
            </span>
            <span v-if="hasActiveFilters && filteredApplications.length !== focusedApplications.length" class="text-[10px] text-surface-400 dark:text-surface-500">
              of {{ focusedApplications.length }}
            </span>
          </div>

          <!-- Scrollable list -->
          <div class="flex-1 overflow-y-auto scrollbar-thin border-t border-surface-100 dark:border-surface-800/60">
            <div v-if="filteredApplications.length === 0" class="p-3">
              <button
                v-if="hasActiveFilters"
                class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200 transition-colors"
                @click="clearFilters"
              >
                <X class="size-3" />
                Clear filters
              </button>
            </div>

            <div
              v-for="(app, idx) in filteredApplications"
              :key="app.id"
              class="pipeline-candidate-card group relative grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 px-3.5 py-3 text-left transition-all duration-150"
              :class="currentIndex === idx
                ? 'bg-brand-50/70 dark:bg-brand-950/20 border-l-[3px] border-l-brand-500 dark:border-l-brand-400'
                : 'border-l-[3px] border-l-transparent hover:bg-surface-50/80 dark:hover:bg-surface-800/40'"
            >
              <button
                type="button"
                class="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500"
                :aria-label="`Open candidate ${formatPersonName(app.candidateFirstName, app.candidateLastName)}`"
                :aria-current="currentIndex === idx ? 'true' : undefined"
                @click="selectCandidate(idx)"
              ></button>
              <div
                class="pointer-events-none relative z-20 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-150"
                :class="currentIndex === idx
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20 dark:bg-brand-600 dark:shadow-brand-500/10'
                  : 'bg-surface-100 text-surface-600 group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-surface-800 dark:text-surface-300 dark:group-hover:bg-brand-950 dark:group-hover:text-brand-300'"
              >
                {{ getCandidateInitials(app.candidateFirstName, app.candidateLastName) }}
              </div>
              <div class="pointer-events-none relative z-20 min-w-0">
                <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
                  {{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}
                </p>
                <CopyEmailButton :email="app.candidateEmail" class="pointer-events-auto mt-0.5 max-w-full text-xs text-surface-500 dark:text-surface-400" />
                <div class="mt-1.5 flex items-center gap-2">
                  <span
                    v-if="app.score != null"
                    class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
                    :class="getScoreBadgeClass(app.score, 'muted')"
                  >
                    {{ app.score }} pts
                  </span>
                  <span class="text-[11px] text-surface-400 dark:text-surface-500">{{ formatRelativeTime(app.createdAt) }}</span>
                  <span v-if="applicationsWithInterviews.has(app.id)" class="inline-flex items-center text-warning-500 dark:text-warning-400" title="Interview scheduled">
                    <Calendar class="size-3" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CENTER PANEL — Candidate detail -->
        <div
          class="flex flex-1 flex-col overflow-hidden"
        >

          <!-- Empty state -->
          <div
            v-if="!currentSummary"
            class="flex flex-1 flex-col items-center justify-center p-8 text-center"
          >
            <div class="flex size-16 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mb-4">
              <UserRound class="size-7 text-surface-400 dark:text-surface-500" />
            </div>
            <p class="flex flex-wrap items-center justify-center gap-2 text-base font-semibold text-surface-700 dark:text-surface-200">
              <span>{{ debouncedApplicationSearch ? 'No matching applications in' : 'No candidates in' }}</span>
              <span
                class="factory-pipeline-empty-status-chip ui-filter-chip factory-pipeline-status-chip inline-flex h-8 min-h-8 items-center gap-2 px-3 text-xs !font-light uppercase leading-none tracking-normal"
                :class="[`factory-pipeline-status-chip-${focusStatus}`]"
                style="font-weight: 300 !important"
              >
                <span class="pipeline-status-dot size-2 rounded-full" :class="{
                  'bg-blue-500 dark:bg-blue-400': focusStatus === 'new',
                  'bg-violet-500 dark:bg-violet-400': focusStatus === 'screening',
                  'bg-amber-500 dark:bg-amber-400': focusStatus === 'interview',
                  'bg-teal-500 dark:bg-teal-400': focusStatus === 'offer',
                  'bg-green-600 dark:bg-green-300': focusStatus === 'hired',
                  'bg-surface-400 dark:bg-surface-500': focusStatus === 'rejected',
                }" />
                {{ formatStatusLabel(focusStatus) }}
              </span>
            </p>
            <p class="mt-1.5 text-sm text-surface-500 dark:text-surface-400 max-w-xs">
              {{ debouncedApplicationSearch
                ? 'Try another search or select a pipeline stage with matches.'
                : 'Switch to another pipeline stage to review candidates.' }}
            </p>
          </div>

          <template v-else>
            <!-- Sticky status transitions (stays visible on scroll) -->
            <div v-if="allowedTransitions.length > 0" class="shrink-0 border-b border-white/10 bg-white/[0.02] px-4 sm:px-6 py-2.5 ui-dashboard-panel-header">
              <div class="factory-application-transition-strip flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
                <button
                  v-for="(nextStatus, idx) in allowedTransitions"
                  :key="nextStatus"
                  :disabled="isMutating"
                  class="ui-filter-chip factory-application-transition-chip inline-flex h-8 min-h-8 cursor-pointer items-center gap-2 px-3 text-xs !font-light uppercase leading-none tracking-normal transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
                  :title="`${getApplicationTransitionLabel(nextStatus)} ${idx + 1}`"
                  :aria-label="`${getApplicationTransitionLabel(nextStatus)} ${idx + 1}`"
                  @click="nextStatus === 'interview' ? openInterviewScheduler() : changeStatus(nextStatus)"
                >
                  <ApplicationTransitionIcon :status="nextStatus" />
                  <span class="factory-application-transition-label">{{ getApplicationTransitionLabel(nextStatus) }}</span>
                  <kbd class="factory-application-transition-shortcut inline-flex items-center justify-center px-1 text-[10px] font-mono leading-none">{{ idx + 1 }}</kbd>
                  <span class="factory-application-transition-tooltip" role="tooltip" aria-hidden="true">
                    {{ getApplicationTransitionLabel(nextStatus) }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Scrollable container: header + tabs + content -->
            <div ref="detailScrollContainer" class="flex-1 overflow-y-auto scrollbar-thin pb-20 md:pb-0">

            <!-- Candidate header -->
            <div class="factory-candidate-header border-b border-white/10 bg-white/[0.02] px-4 sm:px-6 py-4 sm:py-6 ui-dashboard-panel-header">
              <div class="factory-candidate-header-inner flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="factory-candidate-header-primary flex min-w-0 items-start gap-4">
                  <div class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-500/20 dark:from-brand-500 dark:to-brand-700 dark:shadow-brand-500/10">
                    {{ getCandidateInitials(currentSummary.candidateFirstName, currentSummary.candidateLastName) }}
                  </div>
                  <div class="min-w-0">
                    <div class="factory-candidate-header-title-row flex items-center gap-2.5">
                      <h2 class="truncate text-xl font-semibold tracking-tight text-surface-900 dark:text-surface-50">
                        <NuxtLink
                          :to="$localePath(`/dashboard/applications/${currentSummary.id}`)"
                          class="truncate transition-colors hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {{ formatPersonName(currentSummary.candidateFirstName, currentSummary.candidateLastName) }}
                        </NuxtLink>
                      </h2>
                      <ApplicationStatusBadge :status="currentSummary.status" />
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-surface-500 dark:text-surface-400">
                      <CopyEmailButton :email="currentSummary.candidateEmail" class="text-surface-600 dark:text-surface-300" />
                      <span v-if="resolvedCurrentApplication?.candidate.phone" class="inline-flex items-center gap-1.5">
                        <Phone class="size-3.5" />
                        {{ formatPhoneNumber(resolvedCurrentApplication.candidate.phone) }}
                      </span>
                    </div>
                    <div class="factory-candidate-header-score mt-2 flex flex-wrap items-center gap-2">
                      <span
                        v-if="currentSummary.score != null"
                        class="inline-flex items-baseline gap-1"
                      >
                        <span class="text-lg font-bold tabular-nums" :class="getScoreTextClass(currentSummary.score)">
                          {{ currentSummary.score }}
                        </span>
                        <span class="text-xs text-surface-400 dark:text-surface-500">/ 100</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div class="factory-candidate-header-actions flex shrink-0 flex-col items-end justify-between gap-4 sm:self-stretch">
                  <div class="factory-candidate-header-pager mr-2 flex items-center gap-1.5">
                    <button
                      :disabled="currentIndex === 0"
                      class="flex cursor-pointer items-center justify-center rounded-lg border border-surface-200 p-1.5 text-surface-500 transition-all duration-150 hover:bg-white hover:border-surface-300 hover:text-surface-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:border-surface-600 dark:hover:text-surface-300"
                      @click="goToPreviousCard"
                    >
                      <ArrowLeft class="size-4" />
                    </button>
                    <span class="text-xs font-medium text-surface-500 dark:text-surface-400 tabular-nums px-0.5">
                      {{ currentIndex + 1 }}/{{ filteredApplications.length }}
                    </span>
                    <button
                      :disabled="currentIndex >= filteredApplications.length - 1"
                      class="flex cursor-pointer items-center justify-center rounded-lg border border-surface-200 p-1.5 text-surface-500 transition-all duration-150 hover:bg-white hover:border-surface-300 hover:text-surface-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:border-surface-600 dark:hover:text-surface-300"
                      @click="goToNextCard"
                    >
                      <ArrowRight class="size-4" />
                    </button>
                  </div>
                  <ApplicationTimestampStack
                    :applied-at="currentSummary.createdAt"
                    :updated-at="currentSummary.updatedAt"
                  />
                </div>
              </div>
            </div>

            <!-- Detail tabs -->
            <div class="factory-candidate-detail-tab-bar border-b border-white/10 bg-white/[0.02] px-4 sm:px-6">
              <div class="factory-dashboard-tabs factory-candidate-detail-tabs grid h-8 w-full grid-cols-7 gap-1">
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  title="Overview"
                  aria-label="Overview"
                  :class="detailTab === 'overview'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'overview'"
                >
                  <UserRound class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">Overview</span>
                  <span class="factory-candidate-detail-tab-tooltip">Overview</span>
                </button>
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  title="AI"
                  aria-label="AI"
                  :class="detailTab === 'ai-analysis'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'ai-analysis'"
                >
                  <Brain class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">AI</span>
                  <span class="factory-candidate-detail-tab-tooltip">AI</span>
                </button>
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  :title="`Interviews${currentApplicationInterviews.length > 0 ? ` (${currentApplicationInterviews.length})` : ''}`"
                  :aria-label="`Interviews${currentApplicationInterviews.length > 0 ? ` (${currentApplicationInterviews.length})` : ''}`"
                  :class="detailTab === 'interviews'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'interviews'"
                >
                  <Calendar class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">Interviews</span>
                  <span
                    v-if="currentApplicationInterviews.length > 0"
                    class="factory-candidate-detail-tab-count"
                  >
                    {{ currentApplicationInterviews.length }}
                  </span>
                  <span class="factory-candidate-detail-tab-tooltip">
                    Interviews<span v-if="currentApplicationInterviews.length > 0"> ({{ currentApplicationInterviews.length }})</span>
                  </span>
                </button>
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  :title="`Documents${resolvedCurrentApplication?.candidate.documents?.length ? ` (${resolvedCurrentApplication.candidate.documents.length})` : ''}`"
                  :aria-label="`Documents${resolvedCurrentApplication?.candidate.documents?.length ? ` (${resolvedCurrentApplication.candidate.documents.length})` : ''}`"
                  :class="detailTab === 'documents'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'documents'"
                >
                  <FileText class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">Documents</span>
                  <span
                    v-if="resolvedCurrentApplication?.candidate.documents?.length"
                    class="factory-candidate-detail-tab-count"
                  >
                    {{ resolvedCurrentApplication.candidate.documents.length }}
                  </span>
                  <span class="factory-candidate-detail-tab-tooltip">
                    Documents<span v-if="resolvedCurrentApplication?.candidate.documents?.length"> ({{ resolvedCurrentApplication.candidate.documents.length }})</span>
                  </span>
                </button>
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  :title="`Responses${resolvedCurrentApplication?.responses?.length ? ` (${resolvedCurrentApplication.responses.length})` : ''}`"
                  :aria-label="`Responses${resolvedCurrentApplication?.responses?.length ? ` (${resolvedCurrentApplication.responses.length})` : ''}`"
                  :class="detailTab === 'responses'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'responses'"
                >
                  <MessageSquare class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">Responses</span>
                  <span
                    v-if="resolvedCurrentApplication?.responses?.length"
                    class="factory-candidate-detail-tab-count"
                  >
                    {{ resolvedCurrentApplication.responses.length }}
                  </span>
                  <span class="factory-candidate-detail-tab-tooltip">
                    Responses<span v-if="resolvedCurrentApplication?.responses?.length"> ({{ resolvedCurrentApplication.responses.length }})</span>
                  </span>
                </button>
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  title="Timeline"
                  aria-label="Timeline"
                  :class="detailTab === 'timeline'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'timeline'"
                >
                  <History class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">Timeline</span>
                  <span class="factory-candidate-detail-tab-tooltip">Timeline</span>
                </button>
                <button
                  class="factory-candidate-detail-tab cursor-pointer"
                  title="Properties"
                  aria-label="Properties"
                  :class="detailTab === 'properties'
                    ? 'factory-candidate-detail-tab-active'
                    : 'factory-candidate-detail-tab-inactive'"
                  @click="detailTab = 'properties'"
                >
                  <SlidersHorizontal class="factory-candidate-detail-tab-icon size-3.5" />
                  <span class="factory-candidate-detail-tab-label">Properties</span>
                  <span class="factory-candidate-detail-tab-tooltip">Properties</span>
                </button>
              </div>
            </div>

            <!-- Detail content -->
            <div class="bg-surface-50/80 dark:bg-surface-950/80 px-4 sm:px-6 py-5 sm:py-8">
              <div v-if="!resolvedCurrentApplication" class="flex flex-col items-center justify-center py-12">
                <div class="size-8 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400 animate-spin" />
                <p class="mt-3 text-sm text-surface-400">Loading details…</p>
              </div>

              <template v-else>



              <!-- PROFILE SECTION (overview only) -->
              <div v-if="showSection.profile" ref="overviewRef" class="space-y-5">
                <!-- Notes -->
                <div class="ui-panel ui-dashboard-panel p-5">
                  <div class="mb-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <MessageSquare class="size-4 text-surface-500 dark:text-surface-400" />
                      <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-200">Notes</h3>
                    </div>
                  </div>
                  <p
                    v-if="currentSummary.notes"
                    class="text-sm text-surface-600 dark:text-surface-300 whitespace-pre-wrap"
                  >
                    {{ currentSummary.notes }}
                  </p>
                  <NuxtLink
                    v-else
                    :to="$localePath(`/dashboard/applications/${currentSummary.id}`)"
                    class="group flex w-full cursor-pointer items-center justify-between border border-dashed border-white/12 bg-black px-3 py-3 text-left text-sm text-surface-400 transition-colors hover:border-brand-500/70 hover:bg-brand-500/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 no-underline"
                  >
                    <span class="italic">No notes yet.</span>
                    <span class="text-xs font-semibold uppercase text-brand-400 transition-colors group-hover:text-brand-300">Add Notes</span>
                  </NuxtLink>
                </div>
              </div>

              <!-- AI SCORE BREAKDOWN -->
              <div v-if="showSection.aiAnalysis" class="w-full" :class="detailTab === 'overview' ? 'mt-5' : ''">
                <Suspense v-if="currentSummary">
                  <JobPipelineAiScorePanel
                    :key="currentSummary.id"
                    :application-id="currentSummary.id"
                    @scored="refreshApps()"
                  />
                  <template #fallback>
                    <div class="ui-panel ui-dashboard-panel p-8 text-center text-sm text-surface-400">
                      Loading score breakdown…
                    </div>
                  </template>
                </Suspense>
              </div>

              <!-- INTERVIEWS SECTION -->
              <div v-if="showSection.interviews" ref="interviewsRef" class="space-y-3" :class="detailTab === 'overview' ? 'mt-10' : ''">
                <div class="flex items-center justify-between mb-3">
                  <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
                    <Calendar class="size-4 text-surface-400 dark:text-surface-500" />
                    Interviews
                  </h2>
                  <button
                    class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700/80 px-2.5 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-white hover:border-surface-300 dark:hover:bg-surface-800 dark:hover:border-surface-600 transition-all duration-150"
                    @click="openInterviewScheduler"
                  >
                    <Plus class="size-3.5" />
                    Schedule Interview
                  </button>
                </div>

                <div v-if="currentApplicationInterviews.length > 0" class="space-y-3">
                  <div
                    v-for="iv in currentApplicationInterviews"
                    :key="iv.id"
                    class="rounded-xl border bg-white shadow-sm shadow-surface-900/[0.03] dark:bg-surface-900 dark:shadow-none transition-all duration-200"
                    :class="expandedInterviewId === iv.id
                      ? 'border-brand-300 dark:border-brand-700 shadow-md'
                      : 'border-surface-200/80 dark:border-surface-800/60 hover:border-surface-300 dark:hover:border-surface-700'"
                  >
                    <!-- Interview card header (always visible) -->
                    <button
                      class="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
                      @click="toggleInterviewExpand(iv.id)"
                    >
                      <div class="flex items-center gap-3.5 min-w-0">
                        <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/40">
                          <component :is="interviewTypeIcons[iv.type] ?? Calendar" class="size-4.5 text-brand-600 dark:text-brand-400" />
                        </div>
                        <div class="min-w-0">
                          <p class="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">
                            {{ iv.title }}
                          </p>
                          <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                            <TimelineDateLink :date="iv.scheduledAt">{{ formatInterviewDateTime(iv.scheduledAt) }}</TimelineDateLink> · {{ iv.duration }} min · {{ interviewTypeLabels[iv.type] ?? iv.type }}
                          </p>
                          <div v-if="iv.googleCalendarEventId" class="mt-1">
                            <a
                              v-if="iv.googleCalendarEventLink"
                              :href="iv.googleCalendarEventLink"
                              target="_blank"
                              rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
                              @click.stop
                            >
                              <Calendar class="size-2.5" />
                              Calendar
                              <ExternalLink class="size-2" />
                            </a>
                            <span v-else class="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                              <Calendar class="size-2.5" />
                              Calendar
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2.5 shrink-0">
                        <span
                          class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset"
                          :class="getInterviewStatusBadgeClass(iv.status)"
                        >
                          <component :is="interviewStatusIcons[iv.status as InterviewStatus] ?? Calendar" class="size-3" />
                          {{ iv.status === 'no_show' ? 'No Show' : iv.status }}
                        </span>
                        <ChevronDown
                          class="size-4 text-surface-400 transition-transform duration-200"
                          :class="{ 'rotate-180': expandedInterviewId === iv.id }"
                        />
                      </div>
                    </button>

                    <!-- Expanded interview detail -->
                    <div v-if="expandedInterviewId === iv.id" class="border-t border-surface-200/80 dark:border-surface-800/60">
                      <!-- Status transition buttons -->
                      <div v-if="getAllowedInterviewTransitions(iv.status).length > 0" class="px-5 pt-4 pb-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mr-1">Actions:</span>
                          <button
                            v-for="nextStatus in getAllowedInterviewTransitions(iv.status)"
                            :key="nextStatus"
                            :disabled="isInterviewTransitioning"
                            class="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            :class="interviewTransitionClasses[nextStatus]"
                            @click.stop="nextStatus === 'scheduled' ? openReschedule(iv) : handleInterviewTransition(iv.id, nextStatus)"
                          >
                            {{ interviewTransitionLabels[nextStatus] }}
                          </button>
                        </div>
                      </div>

                      <!-- Reschedule form (inline) -->
                      <div v-if="rescheduleInterviewId === iv.id" class="px-5 py-4 border-t border-surface-100 dark:border-surface-800/60">
                        <h4 class="text-xs font-semibold text-surface-700 dark:text-surface-300 mb-3 flex items-center gap-1.5">
                          <Calendar class="size-3.5" />
                          Reschedule Interview
                        </h4>
                        <div class="grid grid-cols-3 gap-3">
                          <div>
                            <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Date</label>
                            <input
                              v-model="rescheduleForm.date"
                              type="date"
                              class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-sm text-surface-900 dark:text-surface-100 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                              @click.stop
                            />
                          </div>
                          <div>
                            <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Time</label>
                            <input
                              v-model="rescheduleForm.time"
                              type="time"
                              class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-sm text-surface-900 dark:text-surface-100 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                              @click.stop
                            />
                          </div>
                          <div>
                            <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Duration (min)</label>
                            <input
                              v-model.number="rescheduleForm.duration"
                              type="number"
                              min="5"
                              max="480"
                              class="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-sm text-surface-900 dark:text-surface-100 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                              @click.stop
                            />
                          </div>
                        </div>
                        <div class="flex items-center justify-end gap-2 mt-3">
                          <button
                            class="cursor-pointer rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                            @click.stop="cancelReschedule"
                          >
                            Cancel
                          </button>
                          <button
                            :disabled="isRescheduling"
                            class="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            @click.stop="handleReschedule"
                          >
                            {{ isRescheduling ? 'Saving…' : 'Reschedule' }}
                          </button>
                        </div>
                      </div>

                      <!-- Interview details / edit form -->
                      <div class="px-5 py-4">
                        <!-- View mode -->
                        <template v-if="editingInterviewId !== iv.id">
                          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <div>
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Date & Time</dt>
                              <dd class="text-surface-800 dark:text-surface-200 font-medium text-[13px]">
                                <TimelineDateLink :date="iv.scheduledAt">{{ formatInterviewDateTimeFull(iv.scheduledAt) }}</TimelineDateLink>
                              </dd>
                            </div>
                            <div>
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Duration</dt>
                              <dd class="text-surface-800 dark:text-surface-200 font-medium text-[13px] flex items-center gap-1.5">
                                <Clock class="size-3.5 text-surface-400" />
                                {{ iv.duration }} minutes
                              </dd>
                            </div>
                            <div>
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Type</dt>
                              <dd class="text-surface-800 dark:text-surface-200 font-medium text-[13px] flex items-center gap-1.5">
                                <component :is="interviewTypeIcons[iv.type] ?? Calendar" class="size-3.5 text-surface-400" />
                                {{ interviewTypeLabels[iv.type] ?? iv.type }}
                              </dd>
                            </div>
                            <div v-if="iv.location">
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Location</dt>
                              <dd class="text-surface-800 dark:text-surface-200 font-medium text-[13px] flex items-center gap-1.5">
                                <MapPin class="size-3.5 text-surface-400" />
                                {{ iv.location }}
                              </dd>
                            </div>
                            <div v-if="iv.interviewers?.length" class="col-span-2">
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Interviewers</dt>
                              <dd class="text-surface-800 dark:text-surface-200 font-medium text-[13px] flex items-center gap-1.5">
                                <Users class="size-3.5 text-surface-400" />
                                {{ iv.interviewers.join(', ') }}
                              </dd>
                            </div>
                            <div v-if="iv.notes" class="col-span-2">
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Notes</dt>
                              <dd class="text-surface-700 dark:text-surface-300 text-[13px] leading-relaxed whitespace-pre-wrap">
                                {{ iv.notes }}
                              </dd>
                            </div>
                            <div v-if="iv.googleCalendarEventId" class="col-span-2">
                              <dt class="text-[11px] font-medium text-surface-400 dark:text-surface-500 mb-0.5">Calendar Sync</dt>
                              <dd class="text-[13px]">
                                <a
                                  v-if="iv.googleCalendarEventLink"
                                  :href="iv.googleCalendarEventLink"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-emerald-700 dark:text-emerald-400 font-medium hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
                                >
                                  <Calendar class="size-3.5" />
                                  Open in Calendar
                                  <ExternalLink class="size-3" />
                                </a>
                                <span v-else class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                  <Calendar class="size-3.5" />
                                  Synced to Calendar
                                </span>
                              </dd>
                            </div>
                          </dl>
                          <div class="flex items-center gap-3 mt-4 pt-3 border-t border-surface-100 dark:border-surface-800/60">
                            <button
                              class="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                              @click.stop="startInterviewEdit(iv)"
                            >
                              <Pencil class="size-3" />
                              Edit Details
                            </button>
                            <NuxtLink
                              :to="$localePath(`/dashboard/interviews/${iv.id}`)"
                              class="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-300 transition-colors"
                              @click.stop
                            >
                              <ExternalLink class="size-3" />
                              Full Page
                            </NuxtLink>
                          </div>
                        </template>

                        <!-- Edit mode -->
                        <template v-else>
                          <div class="space-y-3">
                            <div>
                              <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Title</label>
                              <input
                                v-model="interviewEditForm.title"
                                type="text"
                                class="w-full rounded-lg border px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors"
                                :class="interviewEditErrors.title ? 'border-danger-300 dark:border-danger-600' : 'border-surface-200 dark:border-surface-700'"
                                @click.stop
                              />
                              <p v-if="interviewEditErrors.title" class="mt-1 text-[11px] text-danger-600 dark:text-danger-400">{{ interviewEditErrors.title }}</p>
                            </div>

                            <div>
                              <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Type</label>
                              <FactorySelect
                                v-model="interviewEditForm.type"
                                :options="[
                                  { value: 'video', label: 'Video Call' },
                                  { value: 'phone', label: 'Phone' },
                                  { value: 'in_person', label: 'In Person' },
                                  { value: 'technical', label: 'Technical' },
                                  { value: 'panel', label: 'Panel' },
                                  { value: 'take_home', label: 'Take Home' },
                                ]"
                              />
                            </div>

                            <div>
                              <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Location / Link</label>
                              <input
                                v-model="interviewEditForm.location"
                                type="text"
                                placeholder="Zoom link, office address…"
                                class="w-full rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors"
                                @click.stop
                              />
                            </div>

                            <div>
                              <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1">Notes</label>
                              <textarea
                                v-model="interviewEditForm.notes"
                                rows="3"
                                placeholder="Interview notes…"
                                class="w-full rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors"
                                @click.stop
                              />
                            </div>

                            <div>
                              <label class="block text-[11px] font-medium text-surface-500 dark:text-surface-400 mb-1.5">Interviewers</label>
                              <div class="space-y-2">
                                <div v-for="(_, idx) in interviewEditForm.interviewers" :key="idx" class="flex items-center gap-2">
                                  <input
                                    v-model="interviewEditForm.interviewers[idx]"
                                    type="text"
                                    placeholder="Name or email"
                                    class="flex-1 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-1.5 text-sm text-surface-900 dark:text-surface-100 bg-white dark:bg-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors"
                                    @click.stop
                                  />
                                  <button
                                    v-if="interviewEditForm.interviewers.length > 1"
                                    class="cursor-pointer rounded-md p-1 text-surface-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/40 transition-colors"
                                    @click.stop="removeEditInterviewer(idx)"
                                  >
                                    <X class="size-3.5" />
                                  </button>
                                </div>
                              </div>
                              <button
                                class="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                                @click.stop="addEditInterviewer"
                              >
                                <Plus class="size-3" />
                                Add interviewer
                              </button>
                            </div>

                            <div class="flex items-center justify-end gap-2 pt-2">
                              <button
                                class="cursor-pointer rounded-lg border border-surface-300 dark:border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                                @click.stop="cancelInterviewEdit"
                              >
                                Cancel
                              </button>
                              <button
                                :disabled="isInterviewSaving"
                                class="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                @click.stop="saveInterviewEdit"
                              >
                                {{ isInterviewSaving ? 'Saving…' : 'Save Changes' }}
                              </button>
                            </div>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Empty state -->
                <div v-else class="ui-panel ui-dashboard-panel p-10 text-center">
                  <div class="flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800/60 mx-auto mb-3">
                    <Calendar class="size-6 text-surface-400 dark:text-surface-500" />
                  </div>
                  <p class="text-sm font-medium text-surface-600 dark:text-surface-300">No interviews scheduled</p>
                  <p class="mt-1 text-xs text-surface-400 dark:text-surface-500">Schedule an interview to start the process.</p>
                  <button
                    class="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
                    @click="openInterviewScheduler"
                  >
                    <Plus class="size-3.5" />
                    Schedule Interview
                  </button>
                </div>
              </div>

              <!-- DOCUMENTS SECTION -->
              <div v-if="showSection.documents" ref="documentsRef" :class="detailTab === 'overview' ? 'mt-10' : ''">
                <Suspense>
                  <JobPipelineDocumentsPanel
                    :documents="resolvedCurrentApplication?.candidate.documents ?? []"
                    @preview="handleDocPreview"
                  />
                  <template #fallback>
                    <div class="ui-panel ui-dashboard-panel p-8 text-center text-sm text-surface-400">
                      Loading documents…
                    </div>
                  </template>
                </Suspense>
              </div>

              <!-- RESPONSES SECTION -->
              <div v-if="showSection.responses" ref="responsesRef" :class="detailTab === 'overview' ? 'mt-10' : ''">
                <Suspense>
                  <JobPipelineResponsesPanel
                    :responses="resolvedCurrentApplication?.responses ?? []"
                  />
                  <template #fallback>
                    <div class="ui-panel ui-dashboard-panel p-8 text-center text-sm text-surface-400">
                      Loading responses…
                    </div>
                  </template>
                </Suspense>
              </div>

              <!-- PROPERTIES SECTION -->
              <div v-if="showSection.properties && resolvedCurrentApplication" class="w-full" :class="detailTab === 'overview' ? 'mt-10' : ''">
                <div class="ui-panel ui-dashboard-panel p-5">
                  <div class="flex items-center gap-2.5 mb-4">
                    <div class="flex size-7 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40">
                      <SlidersHorizontal class="size-3.5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Properties</h3>
                  </div>
                  <PropertyBlock
                    :key="resolvedCurrentApplication.id"
                    entity-type="application"
                    :entity-id="resolvedCurrentApplication.id"
                    :job-id="jobId"
                    :entries="resolvedCurrentApplication.properties ?? []"
                    @refresh="executeDetailFetch(); refreshApps()"
                  />
                </div>
              </div>

              <!-- TIMELINE SECTION -->
              <div v-if="showSection.timeline">
                <Suspense>
                  <JobPipelineTimelinePanel
                    :candidate-id="resolvedCurrentApplication?.candidate?.id"
                  />
                  <template #fallback>
                    <div class="ui-panel ui-dashboard-panel p-8 text-center text-sm text-surface-400">
                      Loading timeline…
                    </div>
                  </template>
                </Suspense>
              </div>

              </template>
            </div>
            </div>
          </template>
        </div>


      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- MOBILE BOTTOM CANDIDATE BAR              -->
      <!-- ═══════════════════════════════════════ -->
      <div
        v-if="filteredApplications.length > 0"
        class="factory-mobile-candidate-bar md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-white/[0.02] ui-dashboard-panel-header"
        :style="{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }"
      >
        <!-- Horizontal scrollable candidate cards -->
        <div
          ref="mobileBottomBar"
          class="flex items-stretch gap-2 overflow-x-auto snap-x snap-mandatory px-3 py-2.5 scrollbar-thin"
        >
          <button
            v-for="(app, idx) in filteredApplications"
            :key="app.id"
            :data-candidate-idx="idx"
            class="factory-mobile-candidate-card snap-center shrink-0 flex items-center gap-2.5 rounded-xl px-3 py-2 min-w-[130px] max-w-[180px] transition-all duration-150 cursor-pointer"
            :class="currentIndex === idx
              ? 'factory-mobile-candidate-card-active bg-brand-50 ring-2 ring-brand-500 shadow-sm dark:bg-brand-950/30 dark:ring-brand-400'
              : 'factory-mobile-candidate-card-inactive bg-surface-50 ring-1 ring-surface-200 hover:ring-surface-300 dark:bg-surface-800/60 dark:ring-surface-700 dark:hover:ring-surface-600'"
            @click="currentIndex = idx"
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-150"
              :class="currentIndex === idx
                ? 'bg-brand-500 text-white dark:bg-brand-600'
                : 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300'"
            >
              {{ getCandidateInitials(app.candidateFirstName, app.candidateLastName) }}
            </div>
            <div class="min-w-0 text-left">
              <p class="text-xs font-medium text-surface-800 dark:text-surface-100 truncate">
                {{ app.candidateFirstName }}
              </p>
              <div class="flex items-center gap-1 mt-0.5">
                <span
                  v-if="app.score != null"
                  class="text-[10px] font-semibold"
                  :class="{
                    'text-success-600 dark:text-success-400': app.score >= 75,
                    'text-warning-600 dark:text-warning-400': app.score >= 40 && app.score < 75,
                    'text-danger-600 dark:text-danger-400': app.score < 40,
                  }"
                >
                  {{ app.score }}pts
                </span>
                <span class="text-[10px] text-surface-400 dark:text-surface-500">{{ formatRelativeTime(app.createdAt) }}</span>
              </div>
            </div>
          </button>
        </div>
        <!-- Position indicator -->
        <div class="flex items-center justify-center pb-1.5">
          <span class="text-[10px] font-medium text-surface-400 dark:text-surface-500 tabular-nums">
            {{ currentIndex + 1 }} / {{ filteredApplications.length }}
          </span>
        </div>
      </div>

      <!-- Mobile empty state for bottom bar -->
      <div
        v-else-if="focusedApplications.length === 0"
        class="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-white/[0.02] ui-dashboard-panel-header px-4 py-3 text-center"
        :style="{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }"
      >
        <p class="text-xs text-surface-400 dark:text-surface-500">
          No candidates in {{ formatStatusLabel(focusStatus) }}
        </p>
      </div>
    </template>

    <!-- ═══════════════════════════════════════ -->
    <!-- MODALS                                   -->
    <!-- ═══════════════════════════════════════ -->

    <!-- Interview Schedule Sidebar -->
    <InterviewScheduleSidebar
      v-if="showInterviewSidebar && interviewTargetApplication"
      :application-id="interviewTargetApplication.id"
      :candidate-name="interviewTargetApplication.name"
      :job-title="jobData?.title ?? ''"
      :teleport-target="teleportTarget"
      @close="showInterviewSidebar = false"
      @scheduled="handleInterviewScheduled"
    />

    <!-- Document Preview Modal -->
    <Teleport :to="teleportTarget">
      <div v-if="showDocPreview" class="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeDocPreview" />
        <div class="relative flex flex-col bg-white dark:bg-surface-900 rounded-2xl shadow-2xl shadow-surface-900/10 dark:shadow-black/30 ring-1 ring-surface-200/80 dark:ring-surface-700/60 w-full max-w-4xl" style="height: calc(100vh - 3rem);">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-surface-200/80 dark:border-surface-800/60 shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <FileText class="size-4 text-surface-400 shrink-0" />
              <span class="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{{ docPreviewFilename }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0 ml-4">
              <a
                v-if="docPreviewDocId"
                :href="`/api/documents/${docPreviewDocId}/download`"
                class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 hover:border-surface-300 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800 transition-all duration-150"
              >
                <Download class="size-3.5" />
                Download
              </a>
              <button
                class="rounded-lg p-1.5 text-surface-500 hover:text-surface-700 hover:bg-surface-100 dark:hover:text-surface-300 dark:hover:bg-surface-800 transition-colors"
                title="Close"
                @click="closeDocPreview"
              >
                <X class="size-4" />
              </button>
            </div>
          </div>
          <!-- PDF viewer -->
          <iframe
            v-if="docPreviewUrl && isDocPreviewPdf"
            :src="docPreviewUrl"
            class="flex-1 w-full rounded-b-2xl min-h-0"
            title="Document preview"
          />
          <!-- Non-PDF fallback -->
          <div v-else class="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <FileText class="size-12 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
              <p class="text-sm font-medium text-surface-600 dark:text-surface-300">Preview not available for this file type</p>
              <a
                v-if="docPreviewDocId"
                :href="`/api/documents/${docPreviewDocId}/download`"
                class="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium"
              >
                <Download class="size-3.5" />
                Download instead
              </a>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
