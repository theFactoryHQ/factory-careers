export const APPLICATION_STATUS_KEYS = [
  'new',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const

export type ApplicationStatusKey = typeof APPLICATION_STATUS_KEYS[number]
export type ApplicationStatusBadgeVariant = 'soft' | 'ring' | 'subtle-ring' | 'factory'
export type ApplicationTransitionButtonVariant = 'solid' | 'subtle' | 'factory'
export type InterviewStatusBadgeVariant = 'ring'
export type InterviewTransitionButtonVariant = 'solid'
export type JobStatusBadgeVariant = 'soft' | 'ring'
export type ScoreBadgeVariant = 'solid' | 'soft' | 'subtle' | 'muted'
export type CandidateResponseActionKey = typeof CANDIDATE_RESPONSE_ACTION_KEYS[number]
export type CandidateResponseKey = typeof CANDIDATE_RESPONSE_KEYS[number]

const APPLICATION_STATUS_LABELS: Record<ApplicationStatusKey, string> = {
  new: 'New',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

const APPLICATION_TRANSITION_LABELS: Record<ApplicationStatusKey, string> = {
  new: 'Re-open',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Reject',
}

const APPLICATION_STATUS_BADGE_CLASSES: Record<ApplicationStatusBadgeVariant, Record<ApplicationStatusKey, string>> = {
  soft: {
    new: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    screening: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
    interview: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    offer: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
    hired: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
    rejected: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
  },
  ring: {
    new: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-800',
    screening: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:ring-violet-800',
    interview: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-800',
    offer: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:ring-teal-800',
    hired: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/50 dark:text-green-400 dark:ring-green-800',
    rejected: 'bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-800/50 dark:text-surface-400 dark:ring-surface-700',
  },
  'subtle-ring': {
    new: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800/40',
    screening: 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800/40',
    interview: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800/40',
    offer: 'bg-teal-50 text-teal-700 ring-teal-200/60 dark:bg-teal-950 dark:text-teal-400 dark:ring-teal-800/40',
    hired: 'bg-green-50 text-green-700 ring-green-200/60 dark:bg-green-950 dark:text-green-400 dark:ring-green-800/40',
    rejected: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  },
  factory: {
    new: 'border-blue-500/55 bg-blue-500/14 text-blue-200',
    screening: 'border-violet-500/55 bg-violet-500/14 text-violet-200',
    interview: 'border-amber-500/55 bg-amber-500/14 text-amber-200',
    offer: 'border-teal-500/55 bg-teal-500/14 text-teal-200',
    hired: 'border-success-500/55 bg-success-500/14 text-success-200',
    rejected: 'border-white/16 bg-white/[0.04] text-white/58',
  },
}

const APPLICATION_STATUS_BADGE_FALLBACKS: Record<ApplicationStatusBadgeVariant, string> = {
  soft: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
  ring: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  'subtle-ring': 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  factory: 'border-white/16 bg-white/[0.04] text-white/58',
}

const APPLICATION_STATUS_DOT_CLASSES: Record<ApplicationStatusKey, string> = {
  new: 'bg-blue-500',
  screening: 'bg-violet-500',
  interview: 'bg-amber-500',
  offer: 'bg-teal-500',
  hired: 'bg-green-600',
  rejected: 'bg-surface-400 dark:bg-surface-500',
}

export const APPLICATION_PIPELINE_STAGES = [
  { key: 'new', label: 'New', dotClass: 'bg-blue-500', barClass: 'bg-blue-500', textClass: 'text-blue-700 dark:text-blue-400' },
  { key: 'screening', label: 'Screen', dotClass: 'bg-violet-500', barClass: 'bg-violet-500', textClass: 'text-violet-700 dark:text-violet-400' },
  { key: 'interview', label: 'Interview', dotClass: 'bg-amber-500', barClass: 'bg-amber-500', textClass: 'text-amber-700 dark:text-amber-400' },
  { key: 'offer', label: 'Offer', dotClass: 'bg-teal-500', barClass: 'bg-teal-500', textClass: 'text-teal-700 dark:text-teal-400' },
  { key: 'hired', label: 'Hired', dotClass: 'bg-green-600', barClass: 'bg-green-600', textClass: 'text-green-700 dark:text-green-400' },
] as const

const APPLICATION_TRANSITION_BUTTON_CLASSES: Record<ApplicationTransitionButtonVariant, Record<ApplicationStatusKey, string>> = {
  solid: {
    new: 'border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800',
    screening: 'bg-violet-600 text-white hover:bg-violet-700',
    interview: 'bg-amber-600 text-white hover:bg-amber-700',
    offer: 'bg-teal-600 text-white hover:bg-teal-700',
    hired: 'bg-green-700 text-white hover:bg-green-800',
    rejected: 'bg-danger-600 text-white hover:bg-danger-700',
  },
  subtle: {
    new: 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700',
    screening: 'text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950',
    interview: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950',
    offer: 'text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950',
    hired: 'text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900',
    rejected: 'text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950',
  },
  factory: {
    new: 'border border-white/16 bg-black text-white/80 hover:border-brand-500 hover:bg-brand-500/12 hover:text-white',
    screening: 'border border-brand-500 bg-brand-600 text-white hover:bg-brand-500',
    interview: 'border border-amber-500 bg-amber-600 text-white hover:bg-amber-500',
    offer: 'border border-teal-500 bg-teal-600 text-white hover:bg-teal-500',
    hired: 'border border-brand-500 bg-brand-600 text-white hover:bg-brand-500',
    rejected: 'border border-danger-500 bg-danger-600 text-white hover:bg-danger-500',
  },
}

const APPLICATION_TRANSITION_BUTTON_FALLBACKS: Record<ApplicationTransitionButtonVariant, string> = {
  solid: 'border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800',
  subtle: 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
  factory: 'border border-white/16 bg-black text-white/80 hover:border-brand-500 hover:bg-brand-500/12 hover:text-white',
}

const APPLICATION_TRANSITION_DOT_CLASSES: Record<ApplicationStatusKey, string> = {
  new: 'bg-surface-400 dark:bg-surface-500',
  screening: 'bg-violet-200',
  interview: 'bg-amber-200',
  offer: 'bg-teal-200',
  hired: 'bg-green-100',
  rejected: 'bg-danger-200',
}

const INTERVIEW_STATUS_KEYS = [
  'scheduled',
  'scheduled_past',
  'completed',
  'cancelled',
  'no_show',
] as const

type InterviewStatusKey = typeof INTERVIEW_STATUS_KEYS[number]

const INTERVIEW_STATUS_LABELS: Record<InterviewStatusKey, string> = {
  scheduled: 'Scheduled',
  scheduled_past: 'Past Due',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

const INTERVIEW_TRANSITION_LABELS: Record<InterviewStatusKey, string> = {
  scheduled: 'Re-schedule',
  scheduled_past: 'Past Due',
  completed: 'Completed',
  cancelled: 'Cancel',
  no_show: 'No Show',
}

const INTERVIEW_STATUS_BADGE_CLASSES: Record<InterviewStatusBadgeVariant, Record<InterviewStatusKey, string>> = {
  ring: {
    scheduled: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:ring-brand-800',
    scheduled_past: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950/50 dark:text-warning-300 dark:ring-warning-800',
    completed: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950/50 dark:text-success-300 dark:ring-success-800',
    cancelled: 'bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-800/50 dark:text-surface-400 dark:ring-surface-700',
    no_show: 'bg-danger-50 text-danger-700 ring-danger-200 dark:bg-danger-950/50 dark:text-danger-300 dark:ring-danger-800',
  },
}

const INTERVIEW_STATUS_BADGE_FALLBACKS: Record<InterviewStatusBadgeVariant, string> = {
  ring: 'bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-800/50 dark:text-surface-400 dark:ring-surface-700',
}

const INTERVIEW_STATUS_DOT_CLASSES: Record<InterviewStatusKey, string> = {
  scheduled: 'ui-status-dot-brand',
  scheduled_past: 'ui-status-dot-warning',
  completed: 'ui-status-dot-success',
  cancelled: 'ui-status-dot',
  no_show: 'ui-status-dot-danger',
}

const INTERVIEW_TRANSITION_BUTTON_CLASSES: Record<InterviewTransitionButtonVariant, Record<InterviewStatusKey, string>> = {
  solid: {
    scheduled: 'ui-button-secondary',
    scheduled_past: 'ui-button-secondary',
    completed: 'ui-button-success',
    cancelled: 'ui-button-secondary',
    no_show: 'ui-button-danger',
  },
}

const INTERVIEW_TRANSITION_BUTTON_FALLBACKS: Record<InterviewTransitionButtonVariant, string> = {
  solid: 'ui-button-secondary',
}

const JOB_STATUS_KEYS = [
  'draft',
  'open',
  'closed',
  'archived',
] as const

type JobStatusKey = typeof JOB_STATUS_KEYS[number]

const JOB_STATUS_LABELS: Record<JobStatusKey, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
}

const JOB_STATUS_BADGE_CLASSES: Record<JobStatusBadgeVariant, Record<JobStatusKey, string>> = {
  soft: {
    draft: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
    open: 'bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-400',
    closed: 'bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-400',
    archived: 'bg-surface-100 text-surface-400 dark:bg-surface-800 dark:text-surface-500',
  },
  ring: {
    draft: 'bg-surface-50 text-surface-600 ring-surface-200 dark:bg-surface-800/60 dark:text-surface-400 dark:ring-surface-700',
    open: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950/60 dark:text-success-400 dark:ring-success-800',
    closed: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950/60 dark:text-warning-400 dark:ring-warning-800',
    archived: 'bg-surface-50 text-surface-400 ring-surface-200 dark:bg-surface-800/60 dark:text-surface-500 dark:ring-surface-700',
  },
}

const JOB_STATUS_BADGE_FALLBACKS: Record<JobStatusBadgeVariant, string> = {
  soft: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
  ring: 'bg-surface-50 text-surface-600 ring-surface-200 dark:bg-surface-800/60 dark:text-surface-400 dark:ring-surface-700',
}

const CANDIDATE_RESPONSE_ACTION_KEYS = [
  'accepted',
  'declined',
  'tentative',
] as const

const CANDIDATE_RESPONSE_KEYS = [
  'pending',
  ...CANDIDATE_RESPONSE_ACTION_KEYS,
] as const

const CANDIDATE_RESPONSE_ACTION_LABELS: Record<CandidateResponseActionKey, string> = {
  accepted: 'Accept',
  declined: 'Decline',
  tentative: 'Mark as Tentative',
}

const CANDIDATE_RESPONSE_LABELS: Record<CandidateResponseKey, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  tentative: 'Tentative',
}

const CANDIDATE_RESPONSE_BUTTON_CLASSES: Record<CandidateResponseActionKey, string> = {
  accepted: 'bg-success-600 hover:bg-success-700',
  declined: 'bg-danger-600 hover:bg-danger-700',
  tentative: 'bg-warning-600 hover:bg-warning-700',
}

const CANDIDATE_RESPONSE_ICON_CLASSES: Record<CandidateResponseKey, string> = {
  pending: 'bg-info-100 text-info-700 dark:bg-info-950/40 dark:text-info-300',
  accepted: 'bg-success-100 text-success-700 dark:bg-success-950/40 dark:text-success-300',
  declined: 'bg-danger-100 text-danger-700 dark:bg-danger-950/40 dark:text-danger-300',
  tentative: 'bg-warning-100 text-warning-700 dark:bg-warning-950/40 dark:text-warning-300',
}

const CANDIDATE_RESPONSE_SYMBOLS: Record<CandidateResponseActionKey, string> = {
  accepted: '✓',
  declined: '✗',
  tentative: '?',
}

const CANDIDATE_RESPONSE_BUTTON_FALLBACK_CLASS = 'bg-surface-700 hover:bg-surface-800 dark:bg-surface-700 dark:hover:bg-surface-600'
const CANDIDATE_RESPONSE_ICON_FALLBACK_CLASS = 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'

const SCORE_BADGE_CLASSES: Record<ScoreBadgeVariant, Record<ScoreBucket, string>> = {
  solid: {
    high: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950 dark:text-success-300 dark:ring-success-800',
    medium: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950 dark:text-warning-300 dark:ring-warning-800',
    low: 'bg-danger-50 text-danger-700 ring-danger-200 dark:bg-danger-950 dark:text-danger-300 dark:ring-danger-800',
    empty: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  },
  soft: {
    high: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950 dark:text-success-400 dark:ring-success-800',
    medium: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950 dark:text-warning-400 dark:ring-warning-800',
    low: 'bg-danger-50 text-danger-700 ring-danger-200 dark:bg-danger-950 dark:text-danger-400 dark:ring-danger-800',
    empty: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  },
  subtle: {
    high: 'bg-success-50 text-success-700 ring-success-200/60 dark:bg-success-950 dark:text-success-400 dark:ring-success-800/40',
    medium: 'bg-warning-50 text-warning-700 ring-warning-200/60 dark:bg-warning-950 dark:text-warning-400 dark:ring-warning-800/40',
    low: 'bg-danger-50 text-danger-700 ring-danger-200/60 dark:bg-danger-950 dark:text-danger-400 dark:ring-danger-800/40',
    empty: 'bg-surface-100 text-surface-600 ring-surface-200/60 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700/40',
  },
  muted: {
    high: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950/60 dark:text-success-400 dark:ring-success-800',
    medium: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950/60 dark:text-warning-400 dark:ring-warning-800',
    low: 'bg-danger-50 text-danger-700 ring-danger-200 dark:bg-danger-950/60 dark:text-danger-400 dark:ring-danger-800',
    empty: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800/50 dark:text-surface-400 dark:ring-surface-700',
  },
}

const SCORE_TEXT_CLASSES: Record<ScoreBucket, string> = {
  high: 'text-success-600 dark:text-success-400',
  medium: 'text-warning-600 dark:text-warning-400',
  low: 'text-danger-600 dark:text-danger-400',
  empty: 'text-surface-400',
}

const SCORE_BAR_CLASSES: Record<Exclude<ScoreBucket, 'empty'>, string> = {
  high: 'bg-success-500',
  medium: 'bg-warning-500',
  low: 'bg-danger-500',
}

const ANALYSIS_RUN_STATUS_BADGE_CLASSES: Record<string, string> = {
  completed: 'bg-success-50 text-success-700 ring-success-200/60 dark:bg-success-950 dark:text-success-400 dark:ring-success-800/40',
  failed: 'bg-danger-50 text-danger-700 ring-danger-200/60 dark:bg-danger-950 dark:text-danger-400 dark:ring-danger-800/40',
}

const ANALYSIS_RUN_STATUS_DOT_CLASSES: Record<string, string> = {
  completed: 'bg-success-500',
  failed: 'bg-danger-500',
}

const ANALYSIS_RUN_STATUS_PENDING_BADGE_CLASS = 'bg-warning-50 text-warning-700 ring-warning-200/60 dark:bg-warning-950 dark:text-warning-400 dark:ring-warning-800/40'
const ANALYSIS_RUN_STATUS_PENDING_DOT_CLASS = 'bg-warning-500'

const SOURCE_CHANNEL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  ziprecruiter: 'ZipRecruiter',
  monster: 'Monster',
  handshake: 'Handshake',
  angellist: 'AngelList',
  wellfound: 'Wellfound',
  dice: 'Dice',
  stackoverflow: 'Stack Overflow',
  weworkremotely: 'We Work Remotely',
  remoteok: 'Remote OK',
  builtin: 'Built In',
  hired: 'Hired',
  lever: 'Lever',
  greenhouse_board: 'Greenhouse',
  google_jobs: 'Google Jobs',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  referral: 'Referral',
  career_site: 'Career Site',
  email: 'Email',
  event: 'Event',
  agency: 'Agency',
  direct: 'Direct',
  other: 'Other',
  custom: 'Custom',
}

const SOURCE_CHANNEL_DOT_CLASSES: Record<string, string> = {
  linkedin: 'bg-blue-500',
  indeed: 'bg-indigo-500',
  glassdoor: 'bg-emerald-500',
  ziprecruiter: 'bg-green-600',
  monster: 'bg-violet-500',
  google_jobs: 'bg-red-500',
  facebook: 'bg-blue-600',
  twitter: 'bg-surface-700 dark:bg-surface-300',
  instagram: 'bg-pink-500',
  tiktok: 'bg-surface-900 dark:bg-surface-100',
  reddit: 'bg-orange-500',
  referral: 'bg-amber-500',
  career_site: 'bg-brand-500',
  email: 'bg-teal-500',
  direct: 'bg-surface-400',
  other: 'bg-surface-300 dark:bg-surface-600',
  custom: 'bg-brand-400',
  event: 'bg-cyan-500',
  agency: 'bg-rose-500',
}

const SOURCE_CHANNEL_BADGE_CLASSES: Record<string, string> = {
  linkedin: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800/40',
  indeed: 'bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950 dark:text-indigo-400 dark:ring-indigo-800/40',
  glassdoor: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800/40',
  referral: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800/40',
  direct: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  career_site: 'bg-brand-50 text-brand-700 ring-brand-200/60 dark:bg-brand-950 dark:text-brand-400 dark:ring-brand-800/40',
  email: 'bg-teal-50 text-teal-700 ring-teal-200/60 dark:bg-teal-950 dark:text-teal-400 dark:ring-teal-800/40',
}

const SOURCE_CHANNEL_BADGE_FALLBACK_CLASS = 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700'
const SOURCE_CHANNEL_DOT_FALLBACK_CLASS = 'bg-surface-400 dark:bg-surface-500'

type ScoreBucket = 'high' | 'medium' | 'low' | 'empty'

function normalizeApplicationStatus(status: string): string {
  return status.trim().toLowerCase()
}

function isApplicationStatus(status: string): status is ApplicationStatusKey {
  return APPLICATION_STATUS_KEYS.includes(status as ApplicationStatusKey)
}

function isInterviewStatus(status: string): status is InterviewStatusKey {
  return INTERVIEW_STATUS_KEYS.includes(status as InterviewStatusKey)
}

function isJobStatus(status: string): status is JobStatusKey {
  return JOB_STATUS_KEYS.includes(status as JobStatusKey)
}

function isCandidateResponseAction(status: string): status is CandidateResponseActionKey {
  return CANDIDATE_RESPONSE_ACTION_KEYS.includes(status as CandidateResponseActionKey)
}

function isCandidateResponse(status: string): status is CandidateResponseKey {
  return CANDIDATE_RESPONSE_KEYS.includes(status as CandidateResponseKey)
}

function titleizeStatus(status: string): string {
  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatRelativeTime(date: string | Date, now = Date.now()): string {
  const diff = now - new Date(date).getTime()
  const mins = Math.max(0, Math.floor(diff / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getApplicationStatusLabel(status: string): string {
  const normalized = normalizeApplicationStatus(status)
  return isApplicationStatus(normalized) ? APPLICATION_STATUS_LABELS[normalized] : titleizeStatus(status)
}

export function getApplicationTransitionLabel(status: string): string {
  const normalized = normalizeApplicationStatus(status)
  return isApplicationStatus(normalized) ? APPLICATION_TRANSITION_LABELS[normalized] : titleizeStatus(status)
}

export function getApplicationTransitionActionLabel(status: string): string {
  if (status === 'new' || status === 'rejected') {
    return getApplicationTransitionLabel(status)
  }

  return `Move to ${getApplicationTransitionLabel(status)}`
}

export function getApplicationStatusBadgeClass(
  status: string,
  variant: ApplicationStatusBadgeVariant = 'soft',
): string {
  const normalized = normalizeApplicationStatus(status)
  return isApplicationStatus(normalized)
    ? APPLICATION_STATUS_BADGE_CLASSES[variant][normalized]
    : APPLICATION_STATUS_BADGE_FALLBACKS[variant]
}

export function getApplicationStatusDotClass(status: string): string {
  const normalized = normalizeApplicationStatus(status)
  return isApplicationStatus(normalized) ? APPLICATION_STATUS_DOT_CLASSES[normalized] : 'bg-surface-400 dark:bg-surface-500'
}

export function getApplicationTransitionButtonClass(
  status: string,
  variant: ApplicationTransitionButtonVariant = 'solid',
): string {
  const normalized = normalizeApplicationStatus(status)
  return isApplicationStatus(normalized)
    ? APPLICATION_TRANSITION_BUTTON_CLASSES[variant][normalized]
    : APPLICATION_TRANSITION_BUTTON_FALLBACKS[variant]
}

export function getApplicationTransitionDotClass(status: string): string {
  const normalized = normalizeApplicationStatus(status)
  return isApplicationStatus(normalized) ? APPLICATION_TRANSITION_DOT_CLASSES[normalized] : 'bg-surface-400 dark:bg-surface-500'
}

export function getInterviewStatusLabel(status: string): string {
  return isInterviewStatus(status) ? INTERVIEW_STATUS_LABELS[status] : titleizeStatus(status)
}

export function getInterviewTransitionLabel(status: string): string {
  return isInterviewStatus(status) ? INTERVIEW_TRANSITION_LABELS[status] : titleizeStatus(status)
}

export function getInterviewStatusBadgeClass(
  status: string,
  variant: InterviewStatusBadgeVariant = 'ring',
): string {
  return isInterviewStatus(status)
    ? INTERVIEW_STATUS_BADGE_CLASSES[variant][status]
    : INTERVIEW_STATUS_BADGE_FALLBACKS[variant]
}

export function getInterviewStatusDotClass(status: string): string {
  return isInterviewStatus(status) ? INTERVIEW_STATUS_DOT_CLASSES[status] : 'ui-status-dot'
}

export function getInterviewTransitionButtonClass(
  status: string,
  variant: InterviewTransitionButtonVariant = 'solid',
): string {
  return isInterviewStatus(status)
    ? INTERVIEW_TRANSITION_BUTTON_CLASSES[variant][status]
    : INTERVIEW_TRANSITION_BUTTON_FALLBACKS[variant]
}

export function getJobStatusLabel(status: string): string {
  return isJobStatus(status) ? JOB_STATUS_LABELS[status] : titleizeStatus(status)
}

export function getJobStatusBadgeClass(
  status: string,
  variant: JobStatusBadgeVariant = 'soft',
): string {
  return isJobStatus(status)
    ? JOB_STATUS_BADGE_CLASSES[variant][status]
    : JOB_STATUS_BADGE_FALLBACKS[variant]
}

export function getCandidateResponseActionLabel(status: string): string {
  return isCandidateResponseAction(status) ? CANDIDATE_RESPONSE_ACTION_LABELS[status] : titleizeStatus(status)
}

export function getCandidateResponseLabel(status: string): string {
  return isCandidateResponse(status) ? CANDIDATE_RESPONSE_LABELS[status] : titleizeStatus(status)
}

export function getCandidateResponseButtonClass(status: string): string {
  return isCandidateResponseAction(status) ? CANDIDATE_RESPONSE_BUTTON_CLASSES[status] : CANDIDATE_RESPONSE_BUTTON_FALLBACK_CLASS
}

export function getCandidateResponseIconClass(status: string): string {
  return isCandidateResponse(status) ? CANDIDATE_RESPONSE_ICON_CLASSES[status] : CANDIDATE_RESPONSE_ICON_FALLBACK_CLASS
}

export function getCandidateResponseSymbol(status: string): string {
  return isCandidateResponseAction(status) ? CANDIDATE_RESPONSE_SYMBOLS[status] : '?'
}

function getScoreBucket(score: number | null | undefined, max = 100): ScoreBucket {
  if (score == null || max <= 0) return 'empty'
  const pct = (score / max) * 100
  if (pct >= 75) return 'high'
  if (pct >= 40) return 'medium'
  return 'low'
}

export function getScoreBadgeClass(
  score: number | null | undefined,
  variant: ScoreBadgeVariant = 'solid',
): string {
  return SCORE_BADGE_CLASSES[variant][getScoreBucket(score)]
}

export function getScoreTextClass(score: number | null | undefined, max = 100): string {
  return SCORE_TEXT_CLASSES[getScoreBucket(score, max)]
}

export function getScoreBarClass(score: number | null | undefined, max = 100): string {
  const bucket = getScoreBucket(score, max)
  return bucket === 'empty' ? 'bg-surface-300 dark:bg-surface-600' : SCORE_BAR_CLASSES[bucket]
}

export function getAnalysisRunStatusBadgeClass(status: string): string {
  return ANALYSIS_RUN_STATUS_BADGE_CLASSES[status] ?? ANALYSIS_RUN_STATUS_PENDING_BADGE_CLASS
}

export function getAnalysisRunStatusDotClass(status: string): string {
  return ANALYSIS_RUN_STATUS_DOT_CLASSES[status] ?? ANALYSIS_RUN_STATUS_PENDING_DOT_CLASS
}

export function getSourceChannelLabel(channel: string): string {
  return SOURCE_CHANNEL_LABELS[channel] ?? channel
}

export function getSourceChannelBadgeClass(channel: string): string {
  return SOURCE_CHANNEL_BADGE_CLASSES[channel] ?? SOURCE_CHANNEL_BADGE_FALLBACK_CLASS
}

export function getSourceChannelDotClass(channel: string): string {
  return SOURCE_CHANNEL_DOT_CLASSES[channel] ?? SOURCE_CHANNEL_DOT_FALLBACK_CLASS
}
