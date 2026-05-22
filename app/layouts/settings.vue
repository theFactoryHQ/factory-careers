<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

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
  <div class="factory-dashboard-shell flex min-h-screen flex-col">
    <!-- AppTopBar: desktop only -->
    <AppTopBar class="hidden lg:block" />
    <AppToasts />
    <PreviewUpsellModal v-if="isUpsellOpen" @close="closeUpsell" />
    <ClientOnly>
      <DemoUpsellBanner v-if="isDemoAccount" />
    </ClientOnly>

    <!-- Demo mode banner -->
    <div
      v-if="isDemo"
      class="ui-demo-banner mx-auto mb-6 flex max-w-5xl items-center gap-3 px-4 py-2.5 text-sm"
    >
      <Eye class="size-4 shrink-0" />
      <span>
        <strong>Demo mode</strong> — Explore freely with sample data. Editing is disabled here.
        <a
          href="https://github.com/caffeinebounce/factory-careers"
          target="_blank"
          rel="noopener noreferrer"
          class="ui-demo-link ml-1 font-semibold"
        >View source →</a>
      </span>
    </div>

    <div class="flex flex-1 flex-col lg:flex-row min-w-0">
      <!-- Desktop sidebar -->
      <div class="hidden lg:block sticky top-16 h-[calc(100vh-4rem)] shrink-0 z-10">
        <SettingsSidebar />
      </div>
      <!-- Mobile top nav -->
      <div class="lg:hidden sticky top-0 z-10">
        <SettingsMobileNav />
      </div>
      <!-- Page content -->
      <main class="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div class="mx-auto w-full max-w-4xl">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
