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
  <div class="factory-dashboard-shell flex h-screen flex-col overflow-hidden bg-black text-white">
    <!-- AppTopBar: desktop only -->
    <AppTopBar class="hidden lg:block" />
    <AppToasts />
    <PreviewUpsellModal v-if="isUpsellOpen" @close="closeUpsell" />
    <ClientOnly>
      <DemoUpsellBanner v-if="isDemoAccount" />
    </ClientOnly>

    <div class="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
      <!-- Desktop sidebar -->
      <div class="hidden h-full shrink-0 lg:block">
        <SettingsSidebar />
      </div>
      <!-- Mobile top nav -->
      <div class="shrink-0 lg:hidden">
        <SettingsMobileNav />
      </div>
      <!-- Page content -->
      <main class="relative flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <!-- Demo mode banner -->
        <div
          v-if="isDemo"
          class="ui-demo-banner mx-auto mb-6 flex max-w-4xl items-center gap-3 px-4 py-2.5 text-sm"
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

        <div class="mx-auto w-full max-w-4xl">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
