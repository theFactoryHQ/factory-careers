<script setup lang="ts">
import { CheckCircle } from 'lucide-vue-next'

definePageMeta({
  layout: 'public',
})

const route = useRoute()
const jobSlug = route.params.slug as string
const { track } = useTrack()

onMounted(() => track('application_confirmed', { slug: jobSlug }))

// Optionally fetch job title for a nicer confirmation
const { data: job } = useFetch(`/api/public/jobs/${jobSlug}`, {
  key: `public-job-confirm-${jobSlug}`,
})

useSeoMeta({
<<<<<<< HEAD
  title: 'Application Submitted',
=======
  title: 'Application Submitted — Factory Careers',
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="py-12">
    <div class="mx-auto max-w-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center sm:px-10">
      <div class="mx-auto mb-6 flex size-16 items-center justify-center border border-brand-500/35 bg-brand-500/10">
        <CheckCircle class="size-8 text-brand-500" />
      </div>

      <h1 class="mb-3 text-4xl font-light leading-none tracking-tight text-white">
        Application submitted
      </h1>

      <p class="mx-auto mb-2 max-w-md text-white/62">
        Thank you for applying
        <template v-if="job">
          for the <strong class="font-semibold text-white">{{ job.title }}</strong> position
        </template>.
      </p>

      <p class="mx-auto mb-8 max-w-md text-sm text-white/42">
        Your application has been received. The hiring team will review it and get back to you if there&rsquo;s a match.
      </p>

      <div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <NuxtLink
          :to="$localePath('/jobs')"
          class="factory-button-cta factory-button-premium inline-flex h-[48px] min-h-[48px] items-center justify-center px-5 py-0 transition-colors"
        >
          Browse more positions
        </NuxtLink>
        <a
          :href="useRuntimeConfig().public.marketingUrl"
          class="factory-button-cta factory-button-outline inline-flex h-[48px] min-h-[48px] items-center justify-center px-5 py-0 transition-colors"
        >
          Back to Home
        </a>
      </div>
    </div>
  </div>
</template>
