<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'

const localePath = useLocalePath()
</script>

<template>
<<<<<<< HEAD
  <div class="min-h-screen bg-black text-white">
    <header class="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/[0.86] backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <NuxtLink :to="localePath('/jobs')" class="flex items-center gap-3 text-white no-underline">
          <img
            src="/factory-logo.png"
            alt="Factory"
            width="456"
            height="76"
            loading="eager"
            decoding="sync"
            class="h-auto w-[150px] shrink-0 object-contain sm:w-[168px]"
          />
          <span class="text-[25px] font-medium leading-none tracking-normal">Careers</span>
        </NuxtLink>

        <div class="flex items-center gap-3">
          <NuxtLink
            :to="localePath('/jobs')"
            class="hidden items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/42 transition-colors hover:text-brand-500 sm:inline-flex"
          >
            <ArrowLeft class="size-3.5" />
            Open Positions
          </NuxtLink>
          <LanguageSwitcher tone="factory" />
        </div>
=======
  <div class="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4 relative">
    <div class="absolute right-4 top-4 z-10 flex items-center gap-2">
      <ClientOnly>
        <button
          class="inline-flex items-center justify-center size-8 rounded-lg text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all duration-200 cursor-pointer border-0 bg-transparent"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleColorMode"
        >
          <Sun v-if="isDark" class="size-4" />
          <Moon v-else class="size-4" />
        </button>
        <template #fallback>
          <div class="size-8" aria-hidden="true" />
        </template>
      </ClientOnly>
      <LanguageSwitcher />
    </div>
    <div class="w-full max-w-[540px] bg-white dark:bg-surface-900 rounded-lg shadow-sm dark:shadow-none dark:border dark:border-surface-800 p-8">
      <div class="text-center mb-8">
        <div class="flex justify-center mb-3">
          <img src="/factory-logo.png" alt="Factory Careers" class="size-16 object-contain" />
        </div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Factory Careers</h1>
        <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">Hiring operations for Factory</p>
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
      </div>
    </header>

    <main class="flex min-h-screen items-center justify-center px-6 py-28">
      <section class="factory-auth-panel w-full max-w-[540px] border border-white/10 bg-white/[0.03]">
        <div class="h-1 bg-brand-500" />
        <div class="px-6 py-7 sm:px-8 sm:py-8">
          <div class="mb-7">
            <div class="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
              Staff access
            </div>
            <h1 class="text-4xl font-light leading-none tracking-tight text-white">
              Factory Careers
            </h1>
            <p class="mt-3 text-sm leading-6 text-white/50">
              Manage jobs, applications, interviews, and hiring-team workflow.
            </p>
          </div>

          <slot />
        </div>
      </section>
    </main>
  </div>
</template>
