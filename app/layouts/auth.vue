<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'

const localePath = useLocalePath()
</script>

<template>
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
