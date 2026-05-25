<script setup lang="ts">
type LegalParagraph = string | {
  parts: Array<{
    text: string
    href?: string
  }>
}

interface LegalSection {
  id: string
  title: string
  body: LegalParagraph[]
}

interface TableOfContentsItem {
  id: string
  title: string
}

const props = defineProps<{
  title: string
  lastUpdated: string
  sections: LegalSection[]
  tableOfContents?: TableOfContentsItem[]
}>()

const route = useRoute()
const localePath = useLocalePath()
const activeSection = ref(props.sections[0]?.id ?? '')

let observer: IntersectionObserver | undefined

const legalLinks = computed(() => [
  { label: 'Privacy Policy', href: localePath('/privacy') },
  { label: 'Terms of Service', href: localePath('/terms') },
])

const tocItems = computed(() => (
  props.tableOfContents?.length
    ? props.tableOfContents
    : props.sections.map(({ id, title }) => ({ id, title }))
))

const isActiveLegalLink = (href: string) => route.path === href

const paragraphKey = (paragraph: LegalParagraph) => (
  typeof paragraph === 'string'
    ? paragraph
    : paragraph.parts.map(part => `${part.text}:${part.href ?? ''}`).join('|')
)

const observeSections = async () => {
  await nextTick()
  observer?.disconnect()

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeSection.value = entry.target.id
        }
      }
    },
    {
      rootMargin: '-220px 0px -70% 0px',
      threshold: 0,
    },
  )

  for (const item of tocItems.value) {
    const element = document.getElementById(item.id)
    if (element) {
      observer.observe(element)
    }
  }
}

const scrollToSection = (event: MouseEvent, sectionId: string) => {
  const target = document.getElementById(sectionId)
  if (!target) {
    return
  }

  event.preventDefault()

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const heading = target.querySelector('h2') ?? target
  const stickyHeader = document.querySelector('[data-slot="legal-page-header"]')
  const stickyHeaderBottom = stickyHeader?.getBoundingClientRect().bottom ?? 0
  const top = heading.getBoundingClientRect().top + window.scrollY - stickyHeaderBottom - 12

  window.scrollTo({
    top: Math.max(top, 0),
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  })
  window.history.pushState(null, '', `#${sectionId}`)
  activeSection.value = sectionId
}

onMounted(() => {
  observeSections()
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="factory-legal-shell mx-auto w-full max-w-screen-2xl pb-4 print:max-w-none">
    <header
      data-slot="legal-page-header"
      class="sticky top-[calc(4rem+1px)] z-40 border-b border-white/10 bg-black pb-8 pt-8"
    >
      <p class="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
        Factory Careers
      </p>
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <h1 class="text-5xl font-light leading-[0.96] tracking-normal text-white sm:text-6xl">
          {{ title }}
        </h1>
        <div class="flex flex-wrap items-center gap-2 lg:justify-end">
          <span class="inline-flex items-center gap-1.5 border-0 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/62">
            <span class="uppercase text-white/38">Updated</span>
            <span class="text-white/78">{{ lastUpdated }}</span>
          </span>
        </div>
      </div>
    </header>

    <div class="grid gap-8 py-8 lg:grid-cols-12 lg:gap-10 lg:py-10">
      <aside
        data-slot="legal-sidebar"
        class="hidden lg:col-span-3 lg:block lg:sticky lg:top-[14.5rem] lg:max-h-[calc(100vh-15.5rem)] lg:self-start lg:overflow-y-auto print:hidden"
      >
        <nav class="border border-white/10 bg-white/[0.03] p-4" aria-label="Legal navigation">
          <h2 class="text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
            Legal
          </h2>
          <ul class="mt-4 space-y-1">
            <li v-for="link in legalLinks" :key="link.href">
              <NuxtLink
                :to="link.href"
                :aria-current="isActiveLegalLink(link.href) ? 'page' : undefined"
                class="block border-l-2 py-1.5 pl-3 text-sm transition-colors"
                :class="isActiveLegalLink(link.href)
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-white/52 hover:border-white/35 hover:text-white'"
              >
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <nav class="mt-4 border border-white/10 bg-white/[0.03] p-4" aria-label="Table of contents">
          <h2 class="text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
            On this page
          </h2>
          <ul class="mt-4 space-y-1">
            <li v-for="item in tocItems" :key="item.id">
              <a
                :href="`#${item.id}`"
                class="block border-l-2 py-1.5 pl-3 text-sm transition-colors"
                :class="activeSection === item.id
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-white/52 hover:border-white/35 hover:text-white'"
                @click="scrollToSection($event, item.id)"
              >
                {{ item.title }}
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <main
        data-slot="legal-page-content"
        class="min-w-0 lg:col-span-9"
      >
        <nav class="mb-6 border border-white/10 bg-white/[0.03] p-4 lg:hidden print:hidden" aria-label="Legal navigation">
          <h2 class="text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
            Legal
          </h2>
          <div class="mt-4 flex flex-wrap gap-2">
            <NuxtLink
              v-for="link in legalLinks"
              :key="link.href"
              :to="link.href"
              :aria-current="isActiveLegalLink(link.href) ? 'page' : undefined"
              class="inline-flex h-9 items-center px-3 text-xs font-medium uppercase tracking-normal transition-colors"
              :class="isActiveLegalLink(link.href)
                ? 'bg-brand-500 text-white'
                : 'border border-white/10 text-white/62 hover:border-brand-500 hover:text-white'"
            >
              {{ link.label }}
            </NuxtLink>
          </div>
        </nav>

        <nav class="mb-8 border border-white/10 bg-white/[0.03] p-4 lg:hidden print:hidden" aria-label="Table of contents">
          <h2 class="text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
            On this page
          </h2>
          <ul class="mt-4 grid gap-2 sm:grid-cols-2">
            <li v-for="item in tocItems" :key="item.id">
              <a
                :href="`#${item.id}`"
                class="block text-sm text-white/62 transition-colors hover:text-white"
                @click="scrollToSection($event, item.id)"
              >
                {{ item.title }}
              </a>
            </li>
          </ul>
        </nav>

        <div class="space-y-6">
          <section
            v-for="section in sections"
            :id="section.id"
            :key="section.id"
            class="scroll-mt-36 border border-white/10 bg-white/[0.03]"
          >
            <div class="border-b border-white/10 px-5 py-4 sm:px-6">
              <h2 class="text-xl font-semibold text-white">
                {{ section.title }}
              </h2>
            </div>
            <div class="px-5 py-5 sm:px-6">
              <div class="space-y-4 text-sm leading-7 text-white/62">
                <p v-for="paragraph in section.body" :key="paragraphKey(paragraph)">
                  <template v-if="typeof paragraph === 'string'">
                    {{ paragraph }}
                  </template>
                  <template v-else>
                    <template v-for="part in paragraph.parts" :key="`${part.text}:${part.href ?? ''}`">
                      <NuxtLink
                        v-if="part.href && !part.href.includes(':')"
                        :to="part.href"
                        class="font-medium text-brand-500 underline decoration-brand-500 underline-offset-4 transition-colors hover:text-brand-400 hover:decoration-brand-400"
                      >
                        {{ part.text }}
                      </NuxtLink>
                      <a
                        v-else-if="part.href"
                        :href="part.href"
                        class="font-medium text-brand-500 underline decoration-brand-500 underline-offset-4 transition-colors hover:text-brand-400 hover:decoration-brand-400"
                      >
                        {{ part.text }}
                      </a>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </template>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
