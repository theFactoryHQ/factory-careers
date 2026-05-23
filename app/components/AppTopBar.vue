<script setup lang="ts">
import {
  Briefcase, Plus,
  Kanban, FileText, LogOut, Table2,
  MessageSquarePlus, Settings,
  ChevronDown, Menu, X, Users, ChevronLeft,
  LayoutDashboard, Calendar, ArrowUpCircle,
  Cloud, Server, Sparkles, Radio, History,
  MessageCircle, MoreHorizontal,
} from 'lucide-vue-next'
import { getJobStatusBadgeClass, getJobStatusLabel } from '~/utils/status-display'

const route = useRoute()
const localePath = useLocalePath()
const getRouteBaseName = useRouteBaseName()
const { data: session } = await authClient.useSession(useFetch)
const isSigningOut = ref(false)

const showFeedbackModal = ref(false)
const showUserMenu = ref(false)
const showMobileMenu = ref(false)
const showGetStartedMenu = ref(false)
const showMoreNav = ref(false)
const showMoreActions = ref(false)

const config = useRuntimeConfig()
const { activeOrg } = useCurrentOrg()
const languageFeatureEnabled = computed(
  () => config.public.languageFeatureEnabled === true,
)

const isDemo = computed(() => {
  const slug = config.public.demoOrgSlug
  return slug && activeOrg.value?.slug === slug
})

const getStartedMenuRef = useTemplateRef<HTMLElement>('getStartedMenuRoot')
function onClickOutsideGetStarted(e: MouseEvent) {
  if (getStartedMenuRef.value && !getStartedMenuRef.value.contains(e.target as Node)) {
    showGetStartedMenu.value = false
  }
}

const userName = computed(() => session.value?.user?.name ?? 'User')
const userEmail = computed(() => session.value?.user?.email ?? '')
const userImage = computed(() => session.value?.user?.image ?? '')
const userInitials = computed(() => {
  const name = userName.value
  const parts = name.split(' ').filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0] ?? ''
    const second = parts[1] ?? ''
    return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
})

async function handleSignOut() {
  isSigningOut.value = true
  await authClient.signOut()
  clearNuxtData()
  await navigateTo(localePath('/auth/sign-in'))
}

// ─────────────────────────────────────────────
// Dynamic job context
// ─────────────────────────────────────────────

const activeJobId = computed(() => {
  const baseName = getRouteBaseName(route)
  if (typeof baseName !== 'string' || !baseName.startsWith('dashboard-jobs-id')) return null
  const idParam = route.params.id
  if (typeof idParam !== 'string' || idParam === 'new') return null
  return idParam
})

const {
  data: sidebarJobsData,
} = useFetch('/api/jobs', {
  key: 'sidebar-jobs-list',
  query: { limit: 100 },
  headers: useRequestHeaders(['cookie']),
})

const sidebarJobs = computed(() => sidebarJobsData.value?.data ?? [])

const activeJobTitle = computed(() => {
  if (!activeJobId.value) return null
  const found = sidebarJobs.value.find((j: any) => j.id === activeJobId.value)
  return found?.title ?? 'Job'
})

const activeJobStatus = computed(() => {
  if (!activeJobId.value) return null
  const found = sidebarJobs.value.find((j: any) => j.id === activeJobId.value)
  return (found as any)?.status ?? null
})

const { data: feedbackConfig } = useFetch('/api/feedback/config', {
  key: 'feedback-config',
  headers: useRequestHeaders(['cookie']),
})

const isFeedbackEnabled = computed(() => feedbackConfig.value?.enabled === true)

const showChatbot = useFeatureFlagEnabled('chatbot-experience')
const showFactoryMoreActions = false

const jobTabs = computed(() => {
  if (!activeJobId.value) return []
  const base = `/dashboard/jobs/${activeJobId.value}`
  return [
    { label: 'Pipeline', to: base, icon: Kanban, exact: true },
    { label: 'Table', to: `${base}/candidates`, icon: Table2, exact: true },
    { label: 'Application Form', to: `${base}/application-form`, icon: FileText, exact: true },
    { label: 'AI', to: `${base}/ai-analysis`, icon: Sparkles, exact: true },
    { label: 'Settings', to: `${base}/settings`, icon: Settings, exact: true },
  ]
})

// ─────────────────────────────────────────────
// Main navigation
// ─────────────────────────────────────────────

const mainNav: Array<{ label: string; to: string; icon: typeof Briefcase; exact: boolean; comingSoon?: boolean }> = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Jobs', to: '/dashboard/jobs', icon: Briefcase, exact: false },
  { label: 'Candidates', to: '/dashboard/candidates', icon: Users, exact: false },
  { label: 'Applications', to: '/dashboard/applications', icon: FileText, exact: false },
  { label: 'Interviews', to: '/dashboard/interviews', icon: Calendar, exact: false },
  { label: 'Timeline', to: '/dashboard/timeline', icon: History, exact: true },
  { label: 'Tracking', to: '/dashboard/source-tracking', icon: Radio, exact: true },
  { label: 'AI', to: '/dashboard/ai-analysis', icon: Sparkles, exact: true },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings, exact: false },
]

// Items shown only when their feature flag is enabled. Filtered into mainNav
// reactively so the gating happens at render time (PostHog flags load async).
const flaggedNav = computed(() => {
  const items: Array<{ label: string; to: string; icon: typeof Briefcase; exact: boolean; afterLabel: string }> = []
  if (showChatbot.value) {
    items.push({ label: 'Assistant', to: '/dashboard/chatbot', icon: MessageCircle, exact: false, afterLabel: 'AI' })
  }
  return items
})

const navItems = computed(() => {
  const merged = [...mainNav]
  for (const item of flaggedNav.value) {
    const idx = merged.findIndex((n) => n.label === item.afterLabel)
    const insertAt = idx >= 0 ? idx + 1 : merged.length
    merged.splice(insertAt, 0, {
      label: item.label, to: item.to, icon: item.icon, exact: item.exact,
    })
  }
  return merged
})

function isActiveRoute(to: string, exact: boolean) {
  const localizedTo = localePath(to)
  if (exact) return route.path === localizedTo
  return route.path === localizedTo || route.path.startsWith(`${localizedTo}/`)
}

const primaryNavLabels = ['Dashboard', 'Jobs', 'Candidates', 'Applications', 'Interviews']
const primaryNavItems = computed(() => navItems.value.filter(i => primaryNavLabels.includes(i.label)))
const moreNavItems = computed(() => navItems.value.filter(i => !primaryNavLabels.includes(i.label)))

// Close menus on route change
watch(() => route.path, () => {
  showUserMenu.value = false
  showMobileMenu.value = false
  showGetStartedMenu.value = false
  showMoreNav.value = false
  showMoreActions.value = false
})

// ─────────────────────────────────────────────
// New Job button
// ─────────────────────────────────────────────

const newJobResetSignal = useState('new-job-reset-signal', () => 0)

function handleNewJobClick() {
  const newJobPath = localePath('/dashboard/jobs/new')
  if (route.path === newJobPath) {
    // Already on the page: signal the wizard to reset instead of navigating
    newJobResetSignal.value++
  } else {
    navigateTo(newJobPath)
  }
}

// Close user menu on outside click
const userMenuRef = useTemplateRef<HTMLElement>('userMenuRoot')
const moreActionsMenuRef = useTemplateRef<HTMLElement>('moreActionsMenuRoot')
function onClickOutsideUser(e: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    showUserMenu.value = false
  }
}
function onClickOutsideMoreActions(e: MouseEvent) {
  if (moreActionsMenuRef.value && !moreActionsMenuRef.value.contains(e.target as Node)) {
    showMoreActions.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', onClickOutsideUser)
  document.addEventListener('click', onClickOutsideMoreActions)
  document.addEventListener('click', onClickOutsideGetStarted)
})
onUnmounted(() => {
  document.removeEventListener('click', onClickOutsideUser)
  document.removeEventListener('click', onClickOutsideMoreActions)
  document.removeEventListener('click', onClickOutsideGetStarted)
})
</script>

<template>
  <header class="factory-dashboard-topbar sticky top-0 z-50 w-full">
    <!-- Primary navigation bar -->
    <div class="relative z-20 border-b border-white/10 bg-black/90 backdrop-blur-xl">
      <div class="flex h-16 items-center justify-between px-4 lg:px-6">
        <!-- Left: Logo + Nav -->
        <div class="flex min-w-0 items-center gap-2 lg:gap-3">
          <NuxtLink
            :to="$localePath('/dashboard')"
            class="flex shrink-0 items-center gap-3 no-underline transition-opacity hover:opacity-85 mr-2 lg:mr-4"
          >
            <img src="/factory-logo.png" alt="Factory" class="h-auto w-[108px] shrink-0 object-contain sm:w-[128px]" />
            <span class="hidden text-[26px] font-light leading-none tracking-normal text-white sm:block">Careers</span>
          </NuxtLink>

          <!-- Desktop nav links -->
          <nav class="hidden md:flex min-w-0 items-center gap-0.5 overflow-visible">
            <NuxtLink
              v-for="item in primaryNavItems"
              :key="item.to"
              :to="$localePath(item.to)"
              class="group relative flex h-9 items-center gap-1.5 border px-3 text-[13px] font-normal uppercase tracking-[0.25px] transition-all duration-200 no-underline"
              :aria-label="item.label"
              :class="isActiveRoute(item.to, item.exact)
                ? 'border-brand-500/50 bg-brand-500/12 text-white'
                : 'border-transparent text-white/58 hover:text-white'"
            >
              <component :is="item.icon" class="size-4" />
              <span class="hidden min-[1500px]:inline">{{ item.label }}</span>
              <span class="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-white/12 bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 shadow-xl shadow-black/40 transition-all duration-150 min-[1500px]:hidden group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                {{ item.label }}
              </span>
            </NuxtLink>

            <NuxtLink
              v-for="item in moreNavItems"
              :key="item.to"
              :to="$localePath(item.to)"
              class="group relative hidden h-9 items-center gap-1.5 border px-3 text-[13px] font-normal uppercase tracking-[0.25px] transition-all duration-200 no-underline lg:flex"
              :aria-label="item.label"
              :class="isActiveRoute(item.to, item.exact)
                ? 'border-brand-500/50 bg-brand-500/12 text-white'
                : 'border-transparent text-white/58 hover:text-white'"
            >
              <component :is="item.icon" class="size-4" />
              <span class="hidden min-[1800px]:inline">{{ item.label }}</span>
              <span class="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap border border-white/12 bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 shadow-xl shadow-black/40 transition-all duration-150 min-[1800px]:hidden group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                {{ item.label }}
              </span>
            </NuxtLink>

            <!-- More nav dropdown -->
            <div
              v-if="moreNavItems.length"
              class="relative lg:hidden"
              @mouseenter="showMoreNav = true"
              @mouseleave="showMoreNav = false"
            >
              <button
                class="group relative flex h-9 items-center gap-1.5 border px-3 text-[13px] font-normal uppercase tracking-[0.25px] transition-all duration-200 cursor-pointer bg-transparent"
                aria-label="More"
                :class="moreNavItems.some(i => isActiveRoute(i.to, i.exact))
                  ? 'border-brand-500/50 bg-brand-500/12 text-white'
                  : 'border-transparent text-white/58 hover:text-white'"
              >
                  <MoreHorizontal class="size-4 xl:hidden" />
                  <span class="hidden xl:inline">More</span>
                  <ChevronDown
                    class="size-3 opacity-60 transition-transform duration-200"
                    :class="showMoreNav ? 'rotate-180' : ''"
                  />
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
                  v-if="showMoreNav"
                  class="absolute left-0 top-full z-50 pt-1.5"
                >
                  <div class="w-52 border border-white/12 bg-black shadow-2xl shadow-black/50 overflow-hidden py-1">
                    <NuxtLink
                      v-for="item in moreNavItems"
                      :key="item.to"
                      :to="$localePath(item.to)"
                      class="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors no-underline"
                      :class="isActiveRoute(item.to, item.exact)
                        ? 'bg-brand-500/12 text-white'
                        : 'text-white/62 hover:text-white'"
                    >
                      <component :is="item.icon" class="size-4" />
                      {{ item.label }}
                    </NuxtLink>
                  </div>
                </div>
              </Transition>
            </div>
          </nav>
        </div>

        <!-- Right: Actions -->
        <div class="flex shrink-0 items-center gap-1 pl-2 lg:gap-1.5 lg:pl-3 xl:pl-4">
          <!-- Get Started CTA (demo mode only) -->
          <div v-if="isDemo" ref="getStartedMenuRoot" class="relative hidden sm:block">
            <button
              class="factory-button-cta factory-button-premium group inline-flex h-9 items-center gap-2 px-4 text-[13px] transition-all duration-200 cursor-pointer"
              @click="showGetStartedMenu = !showGetStartedMenu"
            >
              <Sparkles class="size-3.5 transition-transform duration-300 group-hover:rotate-12" />
              Get Started
              <ChevronDown
                class="size-3 opacity-70 transition-transform duration-200"
                :class="showGetStartedMenu ? 'rotate-180' : ''"
              />
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
                v-if="showGetStartedMenu"
                class="absolute right-0 top-[calc(100%+6px)] w-72 border border-white/12 bg-black shadow-2xl shadow-black/50 overflow-hidden"
              >
                <div class="px-4 py-3 border-b border-white/10">
                  <p class="text-xs font-medium text-white/45 uppercase tracking-normal">Choose your setup</p>
                </div>
                <div class="p-2 space-y-1">
                  <NuxtLink
                    :to="$localePath('/auth/fresh-signup')"
                    class="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-brand-500/12 no-underline group/item"
                  >
                    <div class="flex items-center justify-center size-8 bg-brand-500/15 text-brand-400 shrink-0 mt-0.5">
                      <Cloud class="size-4" />
                    </div>
                    <div>
                      <div class="text-sm font-semibold text-white transition-colors">Factory Staff</div>
                      <div class="text-xs text-white/48 mt-0.5">Use Microsoft SSO or an invitation to access hiring workflows</div>
                    </div>
                  </NuxtLink>
                  <a
                    href="https://github.com/caffeinebounce/factory-careers"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.05] no-underline group/item"
                  >
                    <div class="flex items-center justify-center size-8 bg-white/[0.06] text-white/58 shrink-0 mt-0.5">
                      <Server class="size-4" />
                    </div>
                    <div>
                      <div class="text-sm font-semibold text-white transition-colors">Source</div>
                      <div class="text-xs text-white/48 mt-0.5">Factory Careers source lives here</div>
                    </div>
                  </a>
                </div>
              </div>
            </Transition>
          </div>

          <!-- New Job button (desktop) -->
          <button
            class="factory-button-cta factory-button-premium mx-1 hidden h-9 items-center gap-1.5 px-3.5 text-[13px] sm:inline-flex"
            @click="handleNewJobClick"
          >
            <Plus class="size-3.5" />
            New Job
          </button>

          <!-- More actions dropdown -->
          <div
            v-if="showFactoryMoreActions"
            ref="moreActionsMenuRoot"
            class="relative hidden sm:block"
            @mouseenter="showMoreActions = true"
            @mouseleave="showMoreActions = false"
          >
            <button
              class="inline-flex items-center justify-center size-8 bg-transparent text-white/55 transition-all duration-200 cursor-pointer hover:bg-white/[0.04] hover:text-white"
              title="More options"
              aria-haspopup="menu"
              :aria-expanded="showMoreActions"
              @click.stop="showMoreActions = true"
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
                v-if="showMoreActions"
                class="absolute right-0 top-full z-50 pt-1.5"
              >
                <div class="w-64 border border-white/12 bg-black shadow-2xl shadow-black/50 overflow-visible py-1">
                  <div class="py-1">
                    <NuxtLink
                      :to="$localePath('/dashboard/updates')"
                      class="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors no-underline"
                      :class="isActiveRoute('/dashboard/updates', false)
                        ? 'bg-brand-500/12 text-white'
                        : 'text-white/62 hover:text-white'"
                    >
                      <ArrowUpCircle class="size-4" />
                      Updates & changelog
                    </NuxtLink>
                    <button
                      v-if="isFeedbackEnabled"
                      class="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-medium text-white/62 hover:text-white transition-colors cursor-pointer border-0 bg-transparent text-left"
                      @click="showFeedbackModal = true; showMoreActions = false"
                    >
                      <MessageSquarePlus class="size-4" />
                      Report issue
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Divider -->
          <div class="hidden sm:block w-px h-6 bg-white/10 mx-0.5" />

          <!-- User menu -->
          <div ref="userMenuRoot" class="relative">
            <button
              class="flex h-9 items-center gap-1.5 border-0 bg-transparent px-0 transition-colors duration-200 cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60"
              @click="showUserMenu = !showUserMenu"
            >
              <img
                v-if="userImage"
                :src="userImage"
                :alt="userName"
                class="size-9 object-cover"
              />
              <div v-else class="flex size-9 items-center justify-center bg-brand-500 text-[11px] font-bold text-white">
                {{ userInitials }}
              </div>
              <ChevronDown
                class="size-3 text-white/45 transition-transform duration-200"
                :class="showUserMenu ? 'rotate-180' : ''"
              />
            </button>

            <!-- User dropdown -->
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 scale-95 -translate-y-1"
              enter-to-class="opacity-100 scale-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 scale-100 translate-y-0"
              leave-to-class="opacity-0 scale-95 -translate-y-1"
            >
              <div
                v-if="showUserMenu"
                class="absolute right-0 top-[calc(100%+6px)] w-64 border border-white/12 bg-black shadow-2xl shadow-black/50 overflow-hidden"
              >
                <!-- User info header -->
                <div class="px-4 py-3 border-b border-white/10">
                  <div class="text-sm font-semibold text-white">{{ userName }}</div>
                  <div class="text-xs text-white/48 truncate mt-0.5">{{ userEmail }}</div>
                </div>

                <!-- Account context -->
                <div class="border-b border-white/10 p-2 space-y-2">
                  <div class="space-y-1.5">
                    <p class="px-1 text-[10px] font-semibold uppercase tracking-wide text-white/38">Organization</p>
                    <OrgSwitcher inline-panel />
                  </div>
                  <div v-if="languageFeatureEnabled" class="space-y-1.5">
                    <p class="px-1 text-[10px] font-semibold uppercase tracking-wide text-white/38">Language</p>
                    <LanguageSwitcher tone="factory" />
                  </div>
                </div>

                <!-- Actions -->
                <div class="py-1">
                  <button
                    class="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer border-0 bg-transparent text-left"
                    :disabled="isSigningOut"
                    @click="handleSignOut"
                  >
                    <LogOut class="size-4" />
                    {{ isSigningOut ? 'Signing out…' : 'Sign out' }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Mobile hamburger -->
          <button
            class="flex md:hidden items-center justify-center size-8 border border-transparent bg-transparent text-white/58 transition-all duration-200 cursor-pointer hover:bg-white/[0.04] hover:text-white"
            @click="showMobileMenu = !showMobileMenu"
          >
            <X v-if="showMobileMenu" class="size-4" />
            <Menu v-else class="size-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Job context sub-navigation bar -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
    >
      <div
        v-if="activeJobId"
        class="relative z-10 border-b border-white/10 bg-black/92 backdrop-blur-lg"
      >
        <div class="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 lg:px-6 h-10 overflow-x-auto scrollbar-none">
          <NuxtLink
            :to="$localePath('/dashboard/jobs')"
            class="hidden sm:flex size-8 items-center justify-center text-white/45 hover:text-white transition-colors no-underline shrink-0"
            aria-label="All jobs"
            title="All jobs"
          >
            <ChevronLeft class="size-3.5" />
          </NuxtLink>

          <div class="hidden sm:block w-px h-4 bg-white/10 shrink-0" />

          <div class="hidden md:flex items-center gap-2 shrink-0 min-w-0">
            <Briefcase class="size-3.5 text-brand-500 shrink-0" />
            <span class="text-sm font-semibold text-white truncate max-w-48">
              {{ activeJobTitle }}
            </span>
            <span
              v-if="activeJobStatus"
              class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize ring-1 ring-inset"
              :class="getJobStatusBadgeClass(activeJobStatus, 'ring')"
            >
              {{ getJobStatusLabel(activeJobStatus) }}
            </span>
          </div>

          <nav class="flex items-center gap-0.5 md:ml-2">
            <NuxtLink
              v-for="tab in jobTabs"
              :key="tab.to"
              :to="$localePath(tab.to)"
              class="factory-button-cta factory-button-cta-sm factory-job-subnav-tab flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-all duration-200 no-underline whitespace-nowrap shrink-0"
              :class="isActiveRoute(tab.to, tab.exact)
                ? 'factory-job-subnav-tab-active border-brand-500/50 bg-brand-500/12 text-white'
                : 'factory-job-subnav-tab-inactive text-white/50 hover:bg-white/[0.04] hover:text-white'"
            >
              <component :is="tab.icon" class="size-3.5" />
              <span class="hidden sm:inline">{{ tab.label }}</span>
            </NuxtLink>
          </nav>

          <div class="ml-auto flex items-center gap-2 shrink-0">
            <div id="job-sub-nav-actions" class="flex items-center gap-2" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- Mobile navigation menu -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showMobileMenu"
        class="relative z-10 md:hidden border-b border-white/10 bg-black/95 backdrop-blur-xl"
      >
        <nav class="px-4 py-3 flex flex-col gap-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="$localePath(item.to)"
            class="flex items-center gap-3 border px-3 py-2.5 text-sm font-medium transition-all no-underline"
            :class="isActiveRoute(item.to, item.exact)
              ? 'border-brand-500/50 bg-brand-500/12 text-white'
              : 'border-transparent text-white/62 hover:bg-white/[0.04] hover:text-white'"
          >
            <component :is="item.icon" class="size-4" />
            {{ item.label }}
            <span
              v-if="item.comingSoon"
              class="ml-auto inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-200/60 dark:ring-amber-800/40"
            >
              Soon
            </span>
          </NuxtLink>

          <button
            class="factory-button-cta factory-button-premium flex w-full items-center gap-3 px-3 py-2.5 text-sm sm:hidden mt-1"
            @click="handleNewJobClick(); showMobileMenu = false"
          >
            <Plus class="size-4" />
            New Job
          </button>

          <!-- Get Started CTA (demo mode, mobile) -->
          <template v-if="isDemo">
            <div class="mt-2 pt-2 border-t border-white/10">
              <p class="px-3 mb-1.5 text-xs font-medium text-white/45 uppercase tracking-normal">Get Started</p>
              <NuxtLink
                :to="$localePath('/auth/fresh-signup')"
                class="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-brand-300 bg-brand-500/12 hover:bg-brand-500/18 transition-colors no-underline"
              >
                <Cloud class="size-4" />
                Factory Staff — Sign in
              </NuxtLink>
              <a
                href="https://github.com/caffeinebounce/factory-careers"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/62 hover:bg-white/[0.05] hover:text-white transition-colors no-underline mt-1"
              >
                <Server class="size-4" />
                Source — View fork
              </a>
            </div>
          </template>
        </nav>

      </div>
    </Transition>
  </header>

  <!-- Feedback modal -->
  <FeedbackModal v-if="showFeedbackModal" @close="showFeedbackModal = false" />
</template>
