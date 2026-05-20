<script setup lang="ts">
const route = useRoute()
const localePath = useLocalePath()

const mainClass = computed(() => {
  if (route.meta.publicWide) {
    return route.meta.publicFlushTop
      ? 'w-full px-4 pb-10 pt-0 sm:px-6 sm:pb-14 lg:px-6'
      : 'w-full px-4 py-10 sm:px-6 sm:py-14 lg:px-6'
  }

  return 'mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14'
})
</script>

<template>
<<<<<<< HEAD
  <div class="dark min-h-screen bg-black text-white">
    <header
      class="border-b border-white/10 bg-black/90 backdrop-blur-xl"
      :class="route.meta.publicPinnedNav ? 'sticky top-0 z-50' : ''"
    >
      <div class="flex h-16 items-center justify-between px-4 lg:px-6">
        <NuxtLink
          :to="localePath('/jobs')"
          class="inline-flex shrink-0 items-center gap-3 text-white no-underline transition-opacity hover:opacity-85"
        >
          <img src="/factory-logo.png" alt="Factory" class="h-auto w-[108px] shrink-0 object-contain sm:w-[128px]" />
          <span class="text-[26px] font-light leading-none tracking-normal text-white">Careers</span>
        </NuxtLink>
        <LanguageSwitcher tone="factory" />
=======
  <div class="min-h-screen bg-surface-50 dark:bg-surface-950">
    <!-- Simple header -->
    <header class="border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <a :href="useRuntimeConfig().public.marketingUrl" class="inline-flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
          <img src="/factory-logo.png" alt="" class="size-7 object-contain" />
          Factory Careers
        </a>
        <LanguageSwitcher />
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
      </div>
    </header>

    <!-- Content -->
    <main :class="mainClass">
      <slot />
    </main>

<<<<<<< HEAD
    <FactoryPublicFooter />
=======
    <!-- Footer -->
    <footer class="border-t border-surface-200 dark:border-surface-800 mt-12">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <p class="text-xs text-surface-400 text-center">
          <a :href="useRuntimeConfig().public.marketingUrl" class="underline hover:text-surface-600 dark:hover:text-surface-300">Factory</a>
          · Powered by Reqcore
        </p>
      </div>
    </footer>
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
  </div>
</template>
