<script setup lang="ts">
const localePath = useLocalePath()
const jobsPath = localePath('/jobs')

useSeoMeta({
  title: 'Open Positions',
  robots: 'noindex, follow',
})

await navigateTo(jobsPath, { redirectCode: 302 })
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-black px-6 text-center text-white">
    <div>
      <p class="mb-4 text-sm text-white/62">Redirecting to Factory Careers.</p>
      <NuxtLink
        :to="jobsPath"
        class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] items-center justify-center px-5 py-0 transition-colors"
      >
        Open Positions
      </NuxtLink>
    </div>
  </main>
</template>
