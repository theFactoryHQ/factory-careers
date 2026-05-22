<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'

type FooterLink = {
  label: string
  href: string
  external?: boolean
}

const localePath = useLocalePath()
const config = useRuntimeConfig()

const marketingUrl = computed(() => String(config.public.marketingUrl || 'https://thefactoryhq.com').replace(/\/+$/, ''))
const currentYear = new Date().getFullYear()

const careersLinks = computed<FooterLink[]>(() => [
  { label: 'Open Positions', href: localePath('/jobs') },
  { label: 'Admin Login', href: localePath('/auth/sign-in') },
])

const factoryLinks = computed<FooterLink[]>(() => [
  { label: 'thefactoryhq.com', href: marketingUrl.value, external: true },
])

const legalLinks = computed<FooterLink[]>(() => [
  { label: 'Privacy Policy', href: localePath('/privacy') },
  { label: 'Terms of Service', href: localePath('/terms') },
])

const socialLinks = [
  {
    label: 'Factory on LinkedIn',
    href: 'https://www.linkedin.com/company/factoryholdings',
    platform: 'linkedin',
  },
  {
    label: 'Factory on Instagram',
    href: 'https://www.instagram.com/factory.hq/',
    platform: 'instagram',
  },
] as const

const footerGroups = computed(() => [
  { title: 'Careers', links: careersLinks.value },
  { title: 'Factory', links: factoryLinks.value },
  { title: 'Legal', links: legalLinks.value },
])
</script>

<template>
  <footer class="mt-16 border-t border-white/10 bg-black" data-slot="factory-public-footer">
    <div class="h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" aria-hidden="true" />

    <div
      class="mx-auto w-full max-w-screen-2xl px-4 py-10 sm:px-6 sm:py-12 lg:px-6"
      data-slot="footer-container"
    >
      <div class="flex flex-col justify-between gap-10 lg:flex-row lg:items-start">
        <div class="max-w-md">
          <a
            :href="marketingUrl"
            class="inline-flex items-center gap-3 text-white no-underline transition-opacity hover:opacity-85"
          >
            <img
              src="/factory-logo.png"
              alt="Factory"
              width="456"
              height="76"
              class="h-auto w-[156px] shrink-0 object-contain"
            />
            <span class="text-[28px] font-light leading-none tracking-normal">Careers</span>
          </a>

          <p class="mt-5 max-w-sm text-sm leading-6 text-white/52">
            Cofound the culture with us.
          </p>

          <div class="mt-5 flex items-center gap-4">
            <a
              v-for="link in socialLinks"
              :key="link.href"
              :href="link.href"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="link.label"
              class="inline-flex items-center border-0 text-white/55 transition-colors hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <span class="sr-only">{{ link.label }}</span>
              <svg
                v-if="link.platform === 'linkedin'"
                aria-hidden="true"
                class="size-5 sm:size-6"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6.94 8.98H3.76v10.26h3.18V8.98ZM5.35 4a1.85 1.85 0 1 0 0 3.7 1.85 1.85 0 0 0 0-3.7Zm13.89 9.57c0-3.09-1.65-4.52-3.85-4.52a3.31 3.31 0 0 0-3.01 1.66h-.04V8.98H9.29v10.26h3.18v-5.08c0-1.34.25-2.64 1.92-2.64 1.64 0 1.66 1.54 1.66 2.73v4.99h3.18v-5.67Z" />
              </svg>
              <svg
                v-else
                aria-hidden="true"
                class="size-5 sm:size-6"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <rect height="16" rx="4" width="16" x="4" y="4" />
                <circle cx="12" cy="12" r="3.2" />
                <circle cx="16.6" cy="7.4" fill="currentColor" r="0.7" stroke="none" />
              </svg>
            </a>
          </div>
        </div>

        <div class="grid gap-8 sm:grid-cols-3 lg:min-w-[42rem] lg:text-right">
          <nav
            v-for="group in footerGroups"
            :key="group.title"
            :aria-label="`${group.title} links`"
          >
            <h2 class="text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
              {{ group.title }}
            </h2>
            <ul class="mt-5 space-y-4">
              <li v-for="link in group.links" :key="link.href">
                <NuxtLink
                  v-if="!link.external"
                  :to="link.href"
                  class="inline-flex items-center gap-1.5 text-sm text-white/52 transition-colors hover:text-brand-500"
                >
                  {{ link.label }}
                </NuxtLink>
                <a
                  v-else
                  :href="link.href"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 text-sm text-white/52 transition-colors hover:text-brand-500"
                >
                  <span>{{ link.label }}</span>
                  <ExternalLink class="size-3" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div class="mt-10 border-t border-white/10 pt-6">
        <div class="flex flex-col justify-between gap-3 text-sm text-white/38 md:flex-row md:items-center">
          <p>&copy; {{ currentYear }} Factory. All rights reserved.</p>
          <a
            :href="marketingUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-brand-500"
          >
            <span>thefactoryhq.com</span>
            <ExternalLink class="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>
