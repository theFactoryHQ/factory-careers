<script setup lang="ts">
const route = useRoute()
const localePath = useLocalePath()

const publicContainerClass = 'factory-layout-container mx-auto max-w-screen-2xl'

const mainClass = computed(() => {
  if (route.meta.publicWide) {
    return route.meta.publicFlushTop
      ? `${publicContainerClass} pb-10 pt-0 sm:pb-14`
      : `${publicContainerClass} py-10 sm:py-14`
  }

  return `${publicContainerClass} py-10 sm:py-14`
})
</script>

<template>
  <div class="dark min-h-screen bg-black text-white">
    <header
      class="border-b border-white/10 bg-black/90 backdrop-blur-xl"
      :class="route.meta.publicPinnedNav ? 'sticky top-0 z-50' : ''"
    >
      <div :class="`${publicContainerClass} flex h-16 items-center justify-between`">
        <NuxtLink
          :to="localePath('/jobs')"
          class="inline-flex shrink-0 items-center gap-3 text-white no-underline transition-opacity hover:opacity-85"
        >
          <img src="/factory-logo.png" alt="Factory" class="h-auto w-[108px] shrink-0 object-contain sm:w-[128px]" />
          <span class="text-[26px] font-light leading-none tracking-normal text-white">Careers</span>
        </NuxtLink>
        <LanguageSwitcher tone="factory" />
      </div>
    </header>

    <!-- Content -->
    <main :class="mainClass">
      <slot />
    </main>

    <FactoryPublicFooter />
  </div>
</template>
