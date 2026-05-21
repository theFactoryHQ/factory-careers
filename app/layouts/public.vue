<script setup lang="ts">
const localePath = useLocalePath()
</script>

<template>
  <div class="dark min-h-screen bg-black text-white">
    <!-- Simple header -->
    <header class="border-b border-white/10 bg-black/90 backdrop-blur-xl">
      <div class="flex h-16 items-center justify-between px-4 lg:px-6">
        <a
          :href="useRuntimeConfig().public.marketingUrl"
          class="inline-flex shrink-0 items-center gap-3 text-white no-underline transition-opacity hover:opacity-85"
        >
          <img src="/factory-logo.png" alt="Factory" class="h-auto w-[108px] shrink-0 object-contain sm:w-[128px]" />
          <span class="text-[26px] font-light leading-none tracking-normal text-white">Careers</span>
        </a>
        <LanguageSwitcher tone="factory" />
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="mt-12 border-t border-white/10">
      <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div class="flex flex-col items-center justify-between gap-3 text-xs text-white/40 sm:flex-row">
          <p>
            <a :href="useRuntimeConfig().public.marketingUrl" class="transition-colors hover:text-brand-500">Factory</a>
            · Careers
          </p>
          <NuxtLink
            :to="localePath('/auth/sign-in')"
            class="inline-flex items-center border border-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-white"
          >
            Admin login
          </NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>
