<script setup lang="ts">
const { needsConsent, acceptAnalytics, declineAnalytics } = useAnalyticsConsent()
</script>

<template>
  <Transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="needsConsent"
      class="fixed bottom-4 right-4 z-50 w-full max-w-[300px] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/95 shadow-2xl backdrop-blur-2xl sm:bottom-6 sm:right-6"
    >
<<<<<<< HEAD
      <!-- Factory brand accent line -->
      <div class="h-px w-full bg-gradient-to-r from-brand-500/50 via-brand-400/25 to-transparent" />

      <div class="px-4 py-3.5">
        <p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.125em] text-white/30">A SMALL ASK</p>
        <p class="text-[13px] leading-relaxed text-white/70">
          Help us improve Factory Careers. No ads, no data selling, just product insights.
        </p>
        <p class="mt-2 text-[11px] text-white/30">
          <a
            :href="`${useRuntimeConfig().public.marketingUrl}/privacy`"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-2 transition hover:text-white/55"
          >
            Privacy policy
          </a>
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="ui-button ui-button-ghost px-3 py-1.5 text-xs font-medium text-white/40 hover:bg-white/10 hover:text-white/80"
            @click="declineAnalytics"
          >
            No thanks
          </button>
          <button
            type="button"
            class="ui-button ui-button-primary px-4 py-1.5 text-xs font-semibold shadow-sm hover:bg-brand-500"
            @click="acceptAnalytics"
          >
            Sure, help improve it
          </button>
        </div>
=======
      <p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">A small ask</p>
      <p class="text-[13px] leading-relaxed text-white/70">
        Help us improve Factory Careers. No ads, no data selling, just product insights.
      </p>
      <p class="mt-1.5 text-[12px] text-white/40">
        <a
          :href="`${useRuntimeConfig().public.marketingUrl}/privacy`"
          target="_blank"
          rel="noopener noreferrer"
          class="underline underline-offset-2 transition hover:text-white/70"
        >
          Privacy policy
        </a>
      </p>
      <div class="mt-3 flex gap-2">
        <button
          type="button"
          class="ui-button ui-button-ghost px-3 py-1.5 text-xs font-medium text-white/40 hover:bg-white/5 hover:text-white/70"
          @click="declineAnalytics"
        >
          No thanks
        </button>
        <button
          type="button"
          class="ui-button ui-button-primary px-4 py-1.5 text-xs font-semibold shadow-sm hover:bg-brand-500"
          @click="acceptAnalytics"
        >
          Sure, help improve it
        </button>
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
      </div>
    </div>
  </Transition>
</template>
