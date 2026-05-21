<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const route = useRoute()
const isFullbleed = computed(() => !!route.meta.fullbleed)

const { data: session } = await authClient.useSession(useFetch)

const config = useRuntimeConfig()
const { activeOrg } = useCurrentOrg()
const { isUpsellOpen, closeUpsell } = usePreviewReadOnly()

const isDemo = computed(() => {
  const slug = config.public.demoOrgSlug
  return slug && activeOrg.value?.slug === slug
})

const isDemoAccount = computed(() => session.value?.user?.email === config.public.liveDemoEmail)
</script>

<template>
  <div class="factory-dashboard-shell flex h-screen flex-col overflow-hidden bg-black text-white">
    <AppTopBar />
    <AppToasts />
    <PreviewUpsellModal v-if="isUpsellOpen" @close="closeUpsell" />
    <ClientOnly>
      <DemoUpsellBanner v-if="isDemoAccount" />
    </ClientOnly>
    <main :class="['relative flex-1 min-h-0 overflow-y-auto', isFullbleed ? 'overflow-hidden' : 'px-4 py-6 sm:px-6 lg:px-8 lg:py-8']">
      <!-- Demo mode banner -->
      <div
        v-if="isDemo"
        class="mx-auto mb-6 flex max-w-5xl items-center gap-3 border border-brand-500/35 bg-brand-500/10 px-4 py-2.5 text-sm text-white/74"
      >
        <Eye class="size-4 shrink-0" />
        <span>
          <strong>Demo mode</strong> — Explore freely with sample data. Editing is disabled here.
          <a
            href="https://github.com/caffeinebounce/factory-careers"
            target="_blank"
            rel="noopener noreferrer"
            class="ml-1 font-semibold text-brand-300 underline decoration-brand-400/40 underline-offset-2 hover:decoration-brand-400"
          >View source →</a>
        </span>
      </div>
      <slot />
    </main>
  </div>
</template>
