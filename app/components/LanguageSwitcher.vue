<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  dropUp?: boolean
  tone?: 'default' | 'factory'
}>(), {
  dropUp: false,
  tone: 'default',
})

const route = useRoute()
const requestURL = useRequestURL()
const runtimeConfig = useRuntimeConfig()
const { locale, locales, t } = useI18n()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const listboxRef = ref<HTMLElement | null>(null)
const languageSelectId = useId()
const languageFeatureEnabled = computed(
  () => runtimeConfig.public.languageFeatureEnabled === true,
)

function closeDropdown(restoreFocus = false) {
  isOpen.value = false
  if (restoreFocus) {
    nextTick(() => triggerRef.value?.focus())
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  if (dropdownRef.value?.contains(target) || listboxRef.value?.contains(target)) return
  closeDropdown()
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
type SwitchLocale = Parameters<typeof switchLocalePath>[0]

type LocaleParam = string | string[] | undefined
type RouteName = string | symbol | null | undefined

const localeFlags: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  vi: '🇻🇳',
  nb: '🇳🇴',
}

type LocaleEntry = string | { code?: string | null }

function getLocaleCode(entry: LocaleEntry): string | null {
  if (typeof entry === 'string') return entry
  if (!entry || typeof entry.code !== 'string') return null
  return entry.code
}

function getLocaleFromRouteParam(value: LocaleParam): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate : null
}

function getFirstPathSegment(path: string): string | null {
  return path.split('?')[0]?.split('/').filter(Boolean)[0] ?? null
}

function normalizePath(path: string | null | undefined): string {
  if (!path) return '/'
  const [withoutQuery = '/'] = path.split('?')
  const [withoutHash = '/'] = withoutQuery.split('#')
  const trimmed = withoutHash.replace(/\/+$/, '')
  return trimmed || '/'
}

function getLocaleFromRouteName(name: RouteName): string | null {
  if (typeof name !== 'string') return null
  const parts = name.split('___')
  return parts[1] ?? null
}

type LocaleWithPartial = { code?: string | null, partial?: boolean }

const localeOptions = computed(() => {
  return locales.value
    .map((entry) => {
      const code = getLocaleCode(entry as LocaleEntry)
      const partial = (entry as LocaleWithPartial).partial === true
      return code ? { code, partial } : null
    })
    .filter((item): item is { code: string, partial: boolean } => !!item)
    .map(({ code, partial }) => ({
      code,
      partial,
      flag: localeFlags[code] ?? '🌐',
    }))
})

function isSwitchLocale(code: string): code is SwitchLocale {
  return localeOptions.value.some(option => option.code === code)
}

const resolvedLocaleCode = computed(() => {
  const currentPath = normalizePath(
    import.meta.client ? window.location.pathname : requestURL.pathname,
  )
  const matchedBySwitchPath = localeOptions.value.find((option) => {
    const localizedPath = switchLocalePath(option.code as SwitchLocale)
    return normalizePath(localizedPath) === currentPath
  })
  if (matchedBySwitchPath) {
    return matchedBySwitchPath.code
  }

  const routeNameLocale = getLocaleFromRouteName(route.name)
  if (routeNameLocale && localeOptions.value.some(option => option.code === routeNameLocale)) {
    return routeNameLocale
  }

  const routeLocale = getLocaleFromRouteParam(route.params?.locale as LocaleParam)
  if (routeLocale && localeOptions.value.some(option => option.code === routeLocale)) {
    return routeLocale
  }

  const routePathLocale = getFirstPathSegment(route.path)
  if (routePathLocale && localeOptions.value.some(option => option.code === routePathLocale)) {
    return routePathLocale
  }

  const routeFullPathLocale = getFirstPathSegment(route.fullPath)
  if (routeFullPathLocale && localeOptions.value.some(option => option.code === routeFullPathLocale)) {
    return routeFullPathLocale
  }

  const requestPathLocale = getFirstPathSegment(requestURL.pathname)
  if (requestPathLocale && localeOptions.value.some(option => option.code === requestPathLocale)) {
    return requestPathLocale
  }

  const localeCode = String(locale.value)
  if (localeOptions.value.some(option => option.code === localeCode)) {
    return localeCode
  }

  return localeOptions.value[0]?.code ?? ''
})

const selectedLocaleCode = computed({
  get: () => resolvedLocaleCode.value,
  set: (nextLocale: string) => {
    void handleLocaleChange(nextLocale)
  },
})
const selectedLocaleIndex = computed(() =>
  localeOptions.value.findIndex(option => option.code === selectedLocaleCode.value),
)

const showI18nProbe = computed(() => {
  const i18nTestQuery = route.query.i18nTest
  if (Array.isArray(i18nTestQuery)) return i18nTestQuery.includes('1')
  return i18nTestQuery === '1'
})

const i18nProbeText = computed(() => t('common.language'))

const isFactoryTone = computed(() => props.tone === 'factory')

const triggerClasses = computed(() => isFactoryTone.value
  ? 'flex h-8 items-center gap-1 border-0 bg-transparent px-2 text-xs font-medium lowercase text-white/70 outline-none transition-colors hover:bg-white/[0.04] hover:text-white focus:text-white focus:ring-1 focus:ring-brand-500/60'
  : 'flex h-8 items-center gap-1 rounded-md border border-surface-300/45 dark:border-surface-700/55 bg-transparent px-2 text-xs font-medium lowercase text-surface-500 dark:text-surface-400 outline-none transition-colors hover:border-surface-400/60 hover:text-surface-700 dark:hover:border-surface-600 dark:hover:text-surface-200 focus:border-brand-500/70 focus:text-surface-800 dark:focus:text-surface-100')

const dropdownClasses = computed(() => isFactoryTone.value
  ? 'min-w-40 border border-white/14 bg-black py-1 text-xs shadow-2xl shadow-black/50'
  : 'min-w-40 rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 text-xs')
const { floatingStyle: dropdownStyle } = useFloatingMenu({
  open: isOpen,
  triggerRef,
  placement: computed(() => props.dropUp ? 'top-start' : 'bottom-end'),
  width: 160,
  estimatedHeight: 180,
  zIndex: 90,
})

function optionClasses(code: string, active = false) {
  if (isFactoryTone.value) {
    return active || code === selectedLocaleCode.value
      ? 'bg-brand-500/12 text-white'
      : 'text-white/68 hover:bg-brand-500/12 hover:text-white'
  }

  return active || code === selectedLocaleCode.value
    ? 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100'
    : 'text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800'
}

const partialBadgeClasses = computed(() => isFactoryTone.value
  ? 'border border-warning-500/40 bg-warning-500/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-300'
  : 'rounded bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400')

const languageListboxNavigation = useListboxNavigation({
  idBase: languageSelectId,
  open: isOpen,
  optionCount: computed(() => localeOptions.value.length),
  selectedIndex: selectedLocaleIndex,
  openListbox: () => {
    isOpen.value = true
  },
  closeListbox: () => closeDropdown(true),
  selectIndex: (index) => {
    const option = localeOptions.value[index]
    if (option) void handleLocaleChange(option.code, true)
  },
})

async function handleLocaleChange(nextLocale: string, restoreFocus = false) {
  if (!nextLocale || nextLocale === selectedLocaleCode.value) {
    closeDropdown(restoreFocus)
    return
  }
  if (!isSwitchLocale(nextLocale)) return
  closeDropdown()
  const switchPath = switchLocalePath(nextLocale)
  await navigateTo(switchPath || localePath('/'))
}
</script>

<template>
  <div v-if="languageFeatureEnabled" class="flex items-center gap-2">
    <span
      v-if="showI18nProbe"
      data-testid="i18n-probe"
      class="text-xs font-medium text-surface-500 dark:text-surface-400"
    >
      {{ i18nProbeText }}
    </span>

    <div ref="dropdownRef" class="relative">
      <!-- Trigger button -->
      <button
        ref="triggerRef"
        :id="languageSelectId"
        type="button"
        :aria-label="t('common.selectLanguage')"
        :aria-expanded="isOpen"
        :aria-controls="`${languageSelectId}-listbox`"
        :aria-activedescendant="languageListboxNavigation.activeDescendantId.value"
        aria-haspopup="listbox"
        :class="triggerClasses"
        @click="isOpen = !isOpen"
        @keydown="languageListboxNavigation.onKeydown"
      >
        <span>{{ localeOptions.find(o => o.code === selectedLocaleCode)?.flag ?? '🌐' }} {{ selectedLocaleCode }}</span>
        <ChevronDown class="size-3 opacity-60 transition-transform duration-150" :class="{ 'rotate-180': isOpen }" />
      </button>

      <!-- Dropdown list -->
      <Teleport to="body">
        <ul
          v-if="isOpen"
          ref="listboxRef"
          :id="`${languageSelectId}-listbox`"
          role="listbox"
          :aria-label="t('common.selectLanguage')"
          :class="dropdownClasses"
          :style="dropdownStyle"
          @keydown="languageListboxNavigation.onKeydown"
        >
          <li
            role="presentation"
            :class="isFactoryTone
              ? 'border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white/38'
              : 'border-b border-surface-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-surface-400 dark:border-surface-700 dark:text-surface-500'"
          >
            Language
          </li>
          <li
            v-for="(option, index) in localeOptions"
            :id="languageListboxNavigation.optionId(index)"
            :key="option.code"
            role="option"
            :aria-selected="option.code === selectedLocaleCode"
            class="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 transition-colors"
            :class="optionClasses(option.code, languageListboxNavigation.activeIndex.value === index)"
            @mouseenter="languageListboxNavigation.activate(index)"
            @click="handleLocaleChange(option.code)"
          >
            <span class="flex items-center gap-1.5">
              <span>{{ option.flag }}</span>
              <span class="font-medium">{{ option.code }}</span>
            </span>
            <span
              v-if="option.partial"
              :class="partialBadgeClasses"
              title="Translation incomplete"
            >
              partial
            </span>
          </li>
        </ul>
      </Teleport>
    </div>
  </div>
</template>
