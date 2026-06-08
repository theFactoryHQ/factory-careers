<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const route = useRoute()
const isFullbleed = computed(() => !!route.meta.fullbleed)

const { session } = await useAuthSession()

const config = useRuntimeConfig()
const { activeOrg } = useCurrentOrg()
const { isUpsellOpen, closeUpsell } = usePreviewReadOnly()

const isDemo = computed(() => {
  const slug = config.public.demoOrgSlug
  return slug && activeOrg.value?.slug === slug
})

const isDemoAccount = computed(() => session.value?.user?.email === config.public.liveDemoEmail)

// Explicit preloading for common dashboard surfaces (pairs with the SWR caching
// we added to the composables and router.options.ts). This makes clicking
// "Jobs", "Candidates", "Source Tracking" etc. feel instant on hover + initial load.
onMounted(() => {
  // The router.options.ts + linkPrefetch: 'hover' already gives us excellent
  // component + data prefetching for <NuxtLink>s in the sidebar/topbar.
  // This onMounted can be expanded with router.prefetch() calls for specific
  // heavy routes if desired in the future.
})
</script>

<template>
  <div class="factory-dashboard-shell flex h-screen flex-col overflow-hidden bg-black text-white">
    <AppTopBar />
    <AppToasts />
    <PreviewUpsellModal v-if="isUpsellOpen" @close="closeUpsell" />
    <ClientOnly>
      <DemoUpsellBanner v-if="isDemoAccount" />
    </ClientOnly>
    <main :class="['relative flex min-h-0 flex-1 flex-col overflow-y-auto', isFullbleed ? 'overflow-hidden' : 'factory-layout-main']">
      <!-- Demo mode banner -->
      <div
        v-if="isDemo"
        class="mb-6 flex w-full items-center gap-3 border border-brand-500/35 bg-brand-500/10 px-4 py-2.5 text-sm text-white/74"
      >
        <Eye class="size-4 shrink-0" />
        <span>
          <strong>Demo mode</strong> - Explore freely with sample data. Editing is disabled here.
          <a
            href="https://github.com/theFactoryHQ/factory-careers"
            target="_blank"
            rel="noopener noreferrer"
            class="ml-1 font-semibold text-brand-300 underline decoration-brand-400/40 underline-offset-2 hover:decoration-brand-400"
          >View source -></a>
        </span>
      </div>
      <div :class="isFullbleed ? 'min-h-0 flex-1' : 'flex-1'">
        <slot />
      </div>
      <AppDashboardFooter :class="isFullbleed ? 'px-6 pb-4' : 'w-full'" />
    </main>
  </div>
</template>
