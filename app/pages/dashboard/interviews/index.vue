<script setup lang="ts">
import {
  Calendar, Clock, Search, X, Video, Phone,
  Building2, Code2, FileText, UsersRound, MoreHorizontal,
  CheckCircle2, XCircle, AlertTriangle, UserRound, Briefcase,
  Pencil, Trash2, MapPin, Users, CalendarDays,
  Mail, ExternalLink,
} from 'lucide-vue-next'
import { INTERVIEW_STATUS_TRANSITIONS } from '~~/shared/status-transitions'
import {
  getInterviewStatusBadgeClass,
  getInterviewStatusDotClass,
  getInterviewStatusLabel,
  getInterviewTransitionButtonClass,
  getInterviewTransitionLabel,
} from '~/utils/status-display'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'Interviews — Factory Careers',
  description: 'Manage all scheduled interviews',
  robots: 'noindex, nofollow',
})

const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()
const { formatPersonName } = useOrgSettings()

// ─── Filters ──────────────────────────────────────────────────────
const searchInput = ref('')
const debouncedSearch = ref('')

let debounceTimer: ReturnType<typeof setTimeout>
watch(searchInput, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearch.value = val.trim().toLowerCase()
  }, 250)
})

const STATUS_OPTIONS = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
type InterviewStatus = typeof STATUS_OPTIONS[number]

const activeStatus = ref<InterviewStatus | undefined>(undefined)
const activeView = ref<'list' | 'calendar'>('list')

const { interviews, total, status: fetchStatus, error, refresh, updateInterview, deleteInterviewById } = useInterviews({
  status: activeStatus,
  limit: 100,
})

// ─── Filtered + sorted ───────────────────────────────────────────
const filteredInterviews = computed(() => {
  let list = [...interviews.value]

  if (debouncedSearch.value) {
    list = list.filter((i) => {
      const name = `${i.candidateFirstName} ${i.candidateLastName}`.toLowerCase()
      const title = i.title.toLowerCase()
      const job = i.jobTitle.toLowerCase()
      const term = debouncedSearch.value
      return name.includes(term) || title.includes(term) || job.includes(term)
    })
  }

  return list
})

// Group by date for calendar-style view
const groupedByDate = computed(() => {
  const groups = new Map<string, typeof filteredInterviews.value>()
  for (const interview of filteredInterviews.value) {
    const dateKey = new Date(interview.scheduledAt).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    if (!groups.has(dateKey)) groups.set(dateKey, [])
    groups.get(dateKey)!.push(interview)
  }
  return groups
})

// ─── Status display ──────────────────────────────────────────────
const interviewStatusIcons: Record<InterviewStatus, any> = {
  scheduled: Calendar,
  completed: CheckCircle2,
  cancelled: XCircle,
  no_show: AlertTriangle,
}

const typeIcons: Record<string, any> = {
  video: Video,
  phone: Phone,
  in_person: Building2,
  technical: Code2,
  panel: UsersRound,
  take_home: FileText,
}

const typeLabels: Record<string, string> = {
  video: 'Video',
  phone: 'Phone',
  in_person: 'In Person',
  technical: 'Technical',
  panel: 'Panel',
  take_home: 'Take Home',
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isUpcoming(dateStr: string) {
  return new Date(dateStr) > new Date()
}

function getCandidateInitials(firstName?: string, lastName?: string) {
  const first = firstName?.trim().charAt(0) ?? ''
  const last = lastName?.trim().charAt(0) ?? ''
  return `${first}${last}`.toUpperCase() || 'C'
}

// ─── Edit modal state ────────────────────────────────────────────
const showEditModal = ref(false)
const editingInterview = ref<typeof interviews.value[number] | null>(null)
const editForm = reactive({
  title: '',
  type: 'video' as string,
  status: 'scheduled' as string,
  date: '',
  time: '',
  duration: 60,
  location: '',
  notes: '',
  interviewers: [''] as string[],
})
const editErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

function openEdit(interviewItem: typeof interviews.value[number]) {
  editingInterview.value = interviewItem
  const d = new Date(interviewItem.scheduledAt)
  editForm.title = interviewItem.title
  editForm.type = interviewItem.type
  editForm.status = interviewItem.status
  editForm.date = d.toISOString().slice(0, 10)
  editForm.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  editForm.duration = interviewItem.duration
  editForm.location = interviewItem.location ?? ''
  editForm.notes = interviewItem.notes ?? ''
  editForm.interviewers = interviewItem.interviewers?.length ? [...interviewItem.interviewers] : ['']
  editErrors.value = {}
  showEditModal.value = true
}

function cancelEdit() {
  showEditModal.value = false
  editingInterview.value = null
  editErrors.value = {}
}

async function handleSaveEdit() {
  editErrors.value = {}

  if (!editForm.title.trim()) editErrors.value.title = 'Title is required'
  if (!editForm.date) editErrors.value.date = 'Date is required'
  if (!editForm.time) editErrors.value.time = 'Time is required'
  if (Object.keys(editErrors.value).length > 0) return

  const scheduledAt = new Date(`${editForm.date}T${editForm.time}`).toISOString()
  const filteredInterviewers = editForm.interviewers.filter(i => i.trim())

  isSaving.value = true
  try {
    await updateInterview(editingInterview.value!.id, {
      title: editForm.title.trim(),
      type: editForm.type as any,
      status: editForm.status as any,
      scheduledAt,
      duration: editForm.duration,
      location: editForm.location.trim() || null,
      notes: editForm.notes.trim() || null,
      interviewers: filteredInterviewers.length > 0 ? filteredInterviewers : null,
    })
    showEditModal.value = false
    editingInterview.value = null
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    editErrors.value.submit = err?.data?.statusMessage ?? 'Failed to update interview'
  } finally {
    isSaving.value = false
  }
}

// ─── Delete ──────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deletingInterview = ref<typeof interviews.value[number] | null>(null)
const isDeleting = ref(false)

function confirmDelete(interviewItem: typeof interviews.value[number]) {
  deletingInterview.value = interviewItem
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingInterview.value) return
  isDeleting.value = true
  try {
    await deleteInterviewById(deletingInterview.value.id)
    showDeleteConfirm.value = false
    deletingInterview.value = null
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to delete interview', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  } finally {
    isDeleting.value = false
  }
}

function getAllowedTransitions(status: string): InterviewStatus[] {
  return (INTERVIEW_STATUS_TRANSITIONS[status] ?? []) as InterviewStatus[]
}

async function quickStatusChange(interviewItem: typeof interviews.value[number], newStatus: InterviewStatus) {
  try {
    await updateInterview(interviewItem.id, { status: newStatus })
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err?.data?.statusMessage, statusCode: err?.data?.statusCode })
  }
}

// ─── More menu (per-row) ─────────────────────────────────────────
const openMenuId = ref<string | null>(null)
const menuRef = ref<HTMLElement | null>(null)

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function handleClickOutsideMenu(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    openMenuId.value = null
  }
}

onMounted(() => document.addEventListener('click', handleClickOutsideMenu))
onUnmounted(() => document.removeEventListener('click', handleClickOutsideMenu))

// ─── Counts ──────────────────────────────────────────────────────
const statusCounts = computed(() => {
  const counts: Record<InterviewStatus, number> = { scheduled: 0, completed: 0, cancelled: 0, no_show: 0 }
  for (const i of interviews.value) {
    if (i.status in counts) counts[i.status as InterviewStatus]++
  }
  return counts
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">Interviews</h1>
        <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
          Manage all scheduled interviews across your jobs
        </p>
      </div>
      <NuxtLink
        :to="$localePath('/dashboard/interviews/templates')"
        class="ui-button ui-button-primary no-underline"
      >
        <Mail class="size-4" />
        Email Templates
      </NuxtLink>
    </div>

    <!-- Status filter pills + search -->
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <!-- Search -->
      <div class="relative flex-1 min-w-[200px] max-w-sm">
        <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
        <input
          v-model="searchInput"
          type="text"
          placeholder="Search interviews, candidates, jobs…"
          class="ui-field py-2 pl-10 pr-9"
        />
        <button
          v-if="searchInput"
          class="ui-button ui-button-ghost absolute right-2 top-1/2 size-6 -translate-y-1/2 p-0"
          @click="searchInput = ''"
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- Status pills -->
      <div class="flex items-center gap-1.5">
        <button
          v-for="s in STATUS_OPTIONS"
          :key="s"
          class="ui-filter-chip rounded-full"
          :class="activeStatus === s
            ? 'ui-filter-chip-active shadow-sm'
            : 'ui-filter-chip-inactive'"
          @click="activeStatus = activeStatus === s ? undefined : s"
        >
          <span class="ui-status-dot size-1.5" :class="getInterviewStatusDotClass(s)" />
          {{ getInterviewStatusLabel(s) }}
          <span class="tabular-nums text-[10px] font-semibold" :class="activeStatus === s ? 'text-white/80' : 'text-surface-400 dark:text-surface-500'">{{ statusCounts[s] }}</span>
        </button>
      </div>

      <!-- View toggle -->
      <div class="ui-panel ml-auto inline-flex overflow-hidden p-0">
        <button
          class="ui-filter-chip rounded-none px-3 py-1.5"
          :class="activeView === 'list'
            ? 'ui-filter-chip-active'
            : 'ui-filter-chip-inactive'"
          @click="activeView = 'list'"
        >
          List
        </button>
        <button
          class="ui-filter-chip rounded-none px-3 py-1.5"
          :class="activeView === 'calendar'
            ? 'ui-filter-chip-active'
            : 'ui-filter-chip-inactive'"
          @click="activeView = 'calendar'"
        >
          <CalendarDays class="inline size-3.5 mr-1 -mt-0.5" />
          Timeline
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="fetchStatus === 'pending'">
      <div class="space-y-3">
        <div
          v-for="i in 3"
          :key="i"
          class="ui-panel p-5 animate-pulse"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="h-4 w-48 bg-surface-200 dark:bg-surface-700 rounded" />
            <div class="h-5 w-20 bg-surface-200 dark:bg-surface-700 rounded-full" />
          </div>
          <div class="flex gap-4">
            <div class="h-3 w-32 bg-surface-200 dark:bg-surface-700 rounded" />
            <div class="h-3 w-24 bg-surface-200 dark:bg-surface-700 rounded" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="ui-alert ui-alert-danger p-4 text-sm"
    >
      Failed to load interviews.
      <button class="ui-inline-link-brand ml-1 cursor-pointer" @click="refresh()">Retry</button>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="filteredInterviews.length === 0"
      class="ui-empty-panel"
    >
      <div class="ui-icon-state ui-icon-tile mx-auto mb-3 size-10">
        <Calendar class="size-5" />
      </div>
      <h3 class="text-base font-semibold text-surface-700 dark:text-surface-200 mb-1">
        {{ searchInput || activeStatus ? 'No matching interviews' : 'No interviews yet' }}
      </h3>
      <p class="text-sm text-surface-500 dark:text-surface-400 mb-4 max-w-xs mx-auto">
        {{ searchInput || activeStatus
          ? 'Try adjusting your filters.'
          : 'Interviews will appear here when you schedule them from the pipeline.' }}
      </p>
      <button
        v-if="activeStatus || searchInput"
        class="ui-button ui-button-secondary"
        @click="activeStatus = undefined; searchInput = ''"
      >
        Clear filters
      </button>
    </div>

    <!-- LIST VIEW -->
    <template v-else-if="activeView === 'list'">
      <div class="space-y-3">
        <div
          v-for="interviewItem in filteredInterviews"
          :key="interviewItem.id"
          class="ui-panel ui-list-row group px-5 py-4"
        >
          <div class="flex items-start justify-between gap-4">
            <!-- Left: main info -->
            <div class="flex items-start gap-3.5 min-w-0 flex-1">
              <!-- Avatar -->
              <div
                class="ui-avatar size-10 rounded-xl text-xs font-bold"
                :class="isUpcoming(interviewItem.scheduledAt)
                  ? 'ui-avatar-brand'
                  : 'ui-dashboard-soft-icon'"
              >
                {{ getCandidateInitials(interviewItem.candidateFirstName, interviewItem.candidateLastName) }}
              </div>

              <div class="min-w-0 flex-1">
                <!-- Title row -->
                <div class="flex items-center gap-2.5 flex-wrap">
                  <NuxtLink
                    :to="$localePath(`/dashboard/interviews/${interviewItem.id}`)"
                    class="ui-inline-link-brand truncate text-sm font-semibold no-underline"
                  >
                    {{ interviewItem.title }}
                  </NuxtLink>
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset"
                    :class="getInterviewStatusBadgeClass(interviewItem.status)"
                  >
                    <span class="ui-status-dot size-1.5" :class="getInterviewStatusDotClass(interviewItem.status)" />
                    {{ getInterviewStatusLabel(interviewItem.status) }}
                  </span>
                </div>

                <!-- Candidate + Job -->
                <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-surface-500 dark:text-surface-400">
                  <span class="inline-flex items-center gap-1">
                    <UserRound class="size-3.5" />
                    {{ formatPersonName(interviewItem.candidateFirstName, interviewItem.candidateLastName) }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <Briefcase class="size-3.5" />
                    {{ interviewItem.jobTitle }}
                  </span>
                </div>

                <!-- Schedule details -->
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-400 dark:text-surface-500">
                  <TimelineDateLink :date="interviewItem.scheduledAt" class="inline-flex items-center gap-1 font-medium" :class="isUpcoming(interviewItem.scheduledAt) ? 'ui-inline-link-brand no-underline' : ''">
                    <Calendar class="size-3.5" />
                    {{ formatDateShort(interviewItem.scheduledAt) }}
                  </TimelineDateLink>
                  <span class="inline-flex items-center gap-1">
                    <Clock class="size-3.5" />
                    {{ formatTime(interviewItem.scheduledAt) }} · {{ interviewItem.duration }}min
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <component :is="typeIcons[interviewItem.type] || Video" class="size-3.5" />
                    {{ typeLabels[interviewItem.type] }}
                  </span>
                  <span v-if="interviewItem.location" class="inline-flex items-center gap-1 truncate max-w-[200px]">
                    <MapPin class="size-3.5 shrink-0" />
                    {{ interviewItem.location }}
                  </span>
                  <span v-if="interviewItem.interviewers?.length" class="inline-flex items-center gap-1">
                    <Users class="size-3.5" />
                    {{ interviewItem.interviewers.join(', ') }}
                  </span>
                  <a
                    v-if="interviewItem.googleCalendarEventId && interviewItem.googleCalendarEventLink"
                    :href="interviewItem.googleCalendarEventLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ui-pill ui-pill-success px-2 py-0.5 text-[10px] no-underline"
                    @click.stop
                  >
                    <Calendar class="size-3" />
                    Google Calendar
                    <ExternalLink class="size-2.5" />
                  </a>
                  <span v-else-if="interviewItem.googleCalendarEventId" class="ui-pill ui-pill-success px-2 py-0.5 text-[10px]">
                    <Calendar class="size-3" />
                    Google Calendar
                  </span>
                </div>
              </div>
            </div>

            <!-- Right: actions -->
            <div class="flex items-center gap-2 shrink-0">
              <!-- Quick status actions -->
              <button
                v-if="interviewItem.status === 'scheduled'"
                class="ui-button px-2.5 py-1.5 text-[11px] font-semibold shadow-sm"
                :class="getInterviewTransitionButtonClass('completed')"
                @click="quickStatusChange(interviewItem, 'completed')"
              >
                {{ getInterviewTransitionLabel('completed') }}
              </button>

              <!-- More menu -->
              <div ref="menuRef" class="relative">
                <button
                  class="ui-button ui-button-ghost p-1.5"
                  @click.stop="toggleMenu(interviewItem.id)"
                >
                  <MoreHorizontal class="size-4" />
                </button>

                <Transition
                  enter-active-class="transition duration-150 ease-out"
                  enter-from-class="opacity-0 scale-95 -translate-y-1"
                  enter-to-class="opacity-100 scale-100 translate-y-0"
                  leave-active-class="transition duration-100 ease-in"
                  leave-from-class="opacity-100 scale-100 translate-y-0"
                  leave-to-class="opacity-0 scale-95 -translate-y-1"
                >
                  <div
                    v-if="openMenuId === interviewItem.id"
                    class="ui-panel ui-floating-menu absolute right-0 top-full mt-1.5 z-50 w-48 overflow-hidden py-1.5 origin-top-right"
                  >
                    <button
                      class="ui-menu-action px-3.5 py-2 text-sm"
                      @click="openEdit(interviewItem); openMenuId = null"
                    >
                      <Pencil class="size-3.5 text-surface-400" />
                      Edit
                    </button>
                    <template v-for="nextStatus in getAllowedTransitions(interviewItem.status)" :key="nextStatus">
                      <button
                        class="ui-menu-action px-3.5 py-2 text-sm"
                        @click="quickStatusChange(interviewItem, nextStatus); openMenuId = null"
                      >
                        <component :is="interviewStatusIcons[nextStatus] || Calendar" class="size-3.5 text-surface-400" />
                        Mark as {{ getInterviewTransitionLabel(nextStatus) }}
                      </button>
                    </template>
                    <div class="ui-menu-divider my-1.5 mx-2" />
                    <button
                      class="ui-menu-action ui-menu-action-danger px-3.5 py-2 text-sm"
                      @click="confirmDelete(interviewItem); openMenuId = null"
                    >
                      <Trash2 class="size-3.5" />
                      Delete
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Total count -->
      <p class="text-xs text-surface-400 pt-3 px-1">
        {{ total }} interview{{ total === 1 ? '' : 's' }} total
      </p>
    </template>

    <!-- TIMELINE VIEW -->
    <template v-else-if="activeView === 'calendar'">
      <div class="space-y-8">
        <div v-for="[dateLabel, dateInterviews] in groupedByDate" :key="dateLabel">
          <div class="flex items-center gap-3 mb-3 px-1">
            <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-7">
              <CalendarDays class="size-3.5" />
            </div>
            <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ dateLabel }}</h3>
            <span class="text-xs text-surface-400 dark:text-surface-500">{{ dateInterviews.length }} interview{{ dateInterviews.length === 1 ? '' : 's' }}</span>
          </div>

          <div class="ui-timeline-line ml-3.5 border-l-2 pl-6 space-y-3">
            <div
              v-for="interviewItem in dateInterviews"
              :key="interviewItem.id"
              class="ui-panel ui-list-row relative px-5 py-4"
            >
              <!-- Timeline dot -->
              <div
                class="absolute -left-[calc(1.5rem+5px)] top-5 size-2.5 rounded-full ring-2 ring-white dark:ring-surface-950"
                :class="getInterviewStatusDotClass(interviewItem.status)"
              />

              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="ui-inline-link-brand text-sm font-semibold no-underline">
                      {{ formatTime(interviewItem.scheduledAt) }}
                    </span>
                    <span class="text-xs text-surface-400">{{ interviewItem.duration }}min</span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset"
                      :class="getInterviewStatusBadgeClass(interviewItem.status)"
                    >
                      {{ getInterviewStatusLabel(interviewItem.status) }}
                    </span>
                  </div>
                  <p class="mt-1 text-sm font-medium">
                    <NuxtLink
                      :to="$localePath(`/dashboard/interviews/${interviewItem.id}`)"
                      class="ui-inline-link-brand no-underline"
                    >
                      {{ interviewItem.title }}
                    </NuxtLink>
                  </p>
                  <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-surface-500 dark:text-surface-400">
                    <span class="inline-flex items-center gap-1">
                      <UserRound class="size-3" />
                      {{ formatPersonName(interviewItem.candidateFirstName, interviewItem.candidateLastName) }}
                    </span>
                    <span class="inline-flex items-center gap-1">
                      <component :is="typeIcons[interviewItem.type]" class="size-3" />
                      {{ typeLabels[interviewItem.type] }}
                    </span>
                    <span v-if="interviewItem.location" class="inline-flex items-center gap-1 truncate max-w-[160px]">
                      <MapPin class="size-3 shrink-0" />
                      {{ interviewItem.location }}
                    </span>
                    <a
                      v-if="interviewItem.googleCalendarEventId && interviewItem.googleCalendarEventLink"
                      :href="interviewItem.googleCalendarEventLink"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="ui-pill ui-pill-success px-1.5 py-0.5 text-[10px] no-underline"
                      @click.stop
                    >
                      <Calendar class="size-2.5" />
                      Synced
                      <ExternalLink class="size-2" />
                    </a>
                    <span v-else-if="interviewItem.googleCalendarEventId" class="ui-pill ui-pill-success px-1.5 py-0.5 text-[10px]">
                      <Calendar class="size-2.5" />
                      Synced
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    class="ui-button ui-button-ghost p-1.5"
                    @click="openEdit(interviewItem)"
                  >
                    <Pencil class="size-3.5" />
                  </button>
                  <button
                    v-if="interviewItem.status === 'scheduled'"
                    class="ui-button px-2 py-1.5 text-[10px] font-semibold shadow-sm"
                    :class="getInterviewTransitionButtonClass('completed')"
                    @click="quickStatusChange(interviewItem, 'completed')"
                  >
                    {{ getInterviewTransitionLabel('completed') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Total count -->
      <p class="text-xs text-surface-400 pt-3 px-1">
        {{ total }} interview{{ total === 1 ? '' : 's' }} total
      </p>
    </template>

    <!-- MODALS -->

    <!-- Edit Interview Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="ui-modal-backdrop absolute inset-0" @click="cancelEdit" />
        <div class="ui-modal-panel relative p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-5">Edit Interview</h3>

          <div v-if="editErrors.submit" class="ui-alert ui-alert-danger mb-4 p-3 text-sm">
            {{ editErrors.submit }}
          </div>

          <form class="space-y-4" @submit.prevent="handleSaveEdit">
            <div>
              <label for="edit-interview-title" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                Title <span class="ui-required-marker">*</span>
              </label>
              <input
                id="edit-interview-title"
                v-model="editForm.title"
                type="text"
                class="ui-field"
                :class="{ 'ui-field-invalid': editErrors.title }"
              />
              <p v-if="editErrors.title" class="ui-feedback-danger mt-1 text-xs">{{ editErrors.title }}</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="edit-interview-type" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Type</label>
                <select
                  id="edit-interview-type"
                  v-model="editForm.type"
                  class="ui-field"
                >
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                  <option value="in_person">In Person</option>
                  <option value="technical">Technical</option>
                  <option value="panel">Panel</option>
                  <option value="take_home">Take Home</option>
                </select>
              </div>
              <div>
                <label for="edit-interview-status" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Status</label>
                <select
                  id="edit-interview-status"
                  v-model="editForm.status"
                  class="ui-field"
                >
                  <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ getInterviewStatusLabel(s) }}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="edit-interview-date" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Date</label>
                <input
                  id="edit-interview-date"
                  v-model="editForm.date"
                  type="date"
                  class="ui-field"
                />
              </div>
              <div>
                <label for="edit-interview-time" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Time</label>
                <input
                  id="edit-interview-time"
                  v-model="editForm.time"
                  type="time"
                  class="ui-field"
                />
              </div>
            </div>

            <div>
              <label for="edit-interview-duration" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Duration (minutes)</label>
              <input
                id="edit-interview-duration"
                v-model.number="editForm.duration"
                type="number"
                min="5"
                max="480"
                class="ui-field"
              />
            </div>

            <div>
              <label for="edit-interview-location" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Location / Link</label>
              <input
                id="edit-interview-location"
                v-model="editForm.location"
                type="text"
                placeholder="Zoom link, office address…"
                class="ui-field"
              />
            </div>

            <div>
              <label for="edit-interview-notes" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Notes</label>
              <textarea
                id="edit-interview-notes"
                v-model="editForm.notes"
                rows="3"
                placeholder="Topics to cover…"
                class="ui-field resize-none"
              />
            </div>

            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                class="ui-button ui-button-secondary"
                @click="cancelEdit"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isSaving"
                class="ui-button ui-button-primary"
              >
                {{ isSaving ? 'Saving…' : 'Save Changes' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirm Modal -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="ui-modal-backdrop absolute inset-0" @click="showDeleteConfirm = false" />
        <div class="ui-modal-panel relative p-6 max-w-sm w-full mx-4">
          <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">Delete Interview</h3>
          <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">
            Are you sure you want to delete <strong>{{ deletingInterview?.title }}</strong>? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <button
              :disabled="isDeleting"
              class="ui-button ui-button-secondary px-3 py-1.5"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
            <button
              :disabled="isDeleting"
              class="ui-button ui-button-danger px-3 py-1.5"
              @click="handleDelete"
            >
              {{ isDeleting ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
