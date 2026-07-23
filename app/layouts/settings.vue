<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { FACTORY_CAREERS_REPOSITORY_URL } from '~~/shared/project-links'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const { session } = await useAuthSession()

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

    <!-- Demo mode banner -->
    <div
      v-if="isDemo"
      class="mb-6 flex w-full items-center gap-3 border border-brand-500/35 bg-brand-500/10 px-4 py-2.5 text-sm text-white/74"
    >
      <Eye class="size-4 shrink-0" />
      <span>
        <strong>Demo mode</strong> — Explore freely with sample data. Editing is disabled here.
        <a
          :href="FACTORY_CAREERS_REPOSITORY_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="ml-1 font-semibold text-brand-300 underline decoration-brand-400/40 underline-offset-2 hover:decoration-brand-400"
        >View source →</a>
      </span>
    </div>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row min-w-0">
      <!-- Desktop sidebar -->
      <div class="hidden lg:block h-full shrink-0 z-10">
        <SettingsSidebar />
      </div>
      <!-- Mobile top nav -->
      <div class="lg:hidden shrink-0 z-10">
        <SettingsMobileNav />
      </div>
      <!-- Page content -->
      <main class="factory-layout-main flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div class="w-full flex-1">
          <slot />
        </div>
        <AppDashboardFooter class="w-full" />
      </main>
    </div>
  </div>
</template>
