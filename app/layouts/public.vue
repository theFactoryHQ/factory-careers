<template>
  <div class="min-h-screen bg-surface-50 dark:bg-surface-950">
    <!-- Simple header -->
    <header class="border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <a :href="useRuntimeConfig().public.marketingUrl" class="inline-flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
          <img src="/factory-logo.png" alt="" class="size-7 object-contain" />
          Factory Careers
        </a>
        <LanguageSwitcher />
      </div>
    </header>

    <!-- Content -->
    <main class="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t border-surface-200 dark:border-surface-800 mt-12">
      <div class="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <p class="text-xs text-surface-400 text-center">
          <a :href="useRuntimeConfig().public.marketingUrl" class="underline hover:text-surface-600 dark:hover:text-surface-300">Factory</a>
          · Powered by Reqcore
        </p>
      </div>
    </footer>
  </div>
</template>
