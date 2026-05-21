export const APPLICATION_STATUS_KEYS = [
  'new',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const

export type ApplicationStatusKey = typeof APPLICATION_STATUS_KEYS[number]
export type ApplicationStatusBadgeVariant = 'soft' | 'ring' | 'factory'
export type ApplicationTransitionButtonVariant = 'solid' | 'subtle' | 'factory'
export type ScoreBadgeVariant = 'solid' | 'subtle'

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
  factory: {
    new: 'border-brand-500/55 bg-brand-500/14 text-brand-200',
    screening: 'border-brand-500/55 bg-brand-500/14 text-brand-200',
    interview: 'border-brand-500/55 bg-brand-500/14 text-brand-200',
    offer: 'border-brand-500/55 bg-brand-500/14 text-brand-200',
    hired: 'border-success-500/45 bg-success-500/12 text-success-200',
    rejected: 'border-white/16 bg-white/[0.04] text-white/58',
  },
}

const APPLICATION_STATUS_BADGE_FALLBACKS: Record<ApplicationStatusBadgeVariant, string> = {
  soft: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
  ring: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
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
    interview: 'border border-brand-500 bg-brand-600 text-white hover:bg-brand-500',
    offer: 'border border-brand-500 bg-brand-600 text-white hover:bg-brand-500',
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

const SCORE_BADGE_CLASSES: Record<ScoreBadgeVariant, Record<ScoreBucket, string>> = {
  solid: {
    high: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-950 dark:text-success-300 dark:ring-success-800',
    medium: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950 dark:text-warning-300 dark:ring-warning-800',
    low: 'bg-danger-50 text-danger-700 ring-danger-200 dark:bg-danger-950 dark:text-danger-300 dark:ring-danger-800',
    empty: 'bg-surface-100 text-surface-600 ring-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700',
  },
  subtle: {
    high: 'bg-success-50 text-success-700 ring-success-200/60 dark:bg-success-950 dark:text-success-400 dark:ring-success-800/40',
    medium: 'bg-warning-50 text-warning-700 ring-warning-200/60 dark:bg-warning-950 dark:text-warning-400 dark:ring-warning-800/40',
    low: 'bg-danger-50 text-danger-700 ring-danger-200/60 dark:bg-danger-950 dark:text-danger-400 dark:ring-danger-800/40',
    empty: 'bg-surface-100 text-surface-600 ring-surface-200/60 dark:bg-surface-800 dark:text-surface-400 dark:ring-surface-700/40',
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

type ScoreBucket = 'high' | 'medium' | 'low' | 'empty'

function isApplicationStatus(status: string): status is ApplicationStatusKey {
  return APPLICATION_STATUS_KEYS.includes(status as ApplicationStatusKey)
}

function titleizeStatus(status: string): string {
  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getApplicationStatusLabel(status: string): string {
  return isApplicationStatus(status) ? APPLICATION_STATUS_LABELS[status] : titleizeStatus(status)
}

export function getApplicationTransitionLabel(status: string): string {
  return isApplicationStatus(status) ? APPLICATION_TRANSITION_LABELS[status] : titleizeStatus(status)
}

export function getApplicationStatusBadgeClass(
  status: string,
  variant: ApplicationStatusBadgeVariant = 'soft',
): string {
  return isApplicationStatus(status)
    ? APPLICATION_STATUS_BADGE_CLASSES[variant][status]
    : APPLICATION_STATUS_BADGE_FALLBACKS[variant]
}

export function getApplicationStatusDotClass(status: string): string {
  return isApplicationStatus(status) ? APPLICATION_STATUS_DOT_CLASSES[status] : 'bg-surface-400 dark:bg-surface-500'
}

export function getApplicationTransitionButtonClass(
  status: string,
  variant: ApplicationTransitionButtonVariant = 'solid',
): string {
  return isApplicationStatus(status)
    ? APPLICATION_TRANSITION_BUTTON_CLASSES[variant][status]
    : APPLICATION_TRANSITION_BUTTON_FALLBACKS[variant]
}

export function getApplicationTransitionDotClass(status: string): string {
  return isApplicationStatus(status) ? APPLICATION_TRANSITION_DOT_CLASSES[status] : 'bg-surface-400 dark:bg-surface-500'
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
