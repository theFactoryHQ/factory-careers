<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-brand-500/15"
    role="progressbar"
    aria-label="Refreshing data"
  >
    <div class="h-full w-1/3 bg-brand-500 animate-[stale-revalidate_1.1s_ease-in-out_infinite]" />
  </div>
</template>

<style scoped>
@keyframes stale-revalidate {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(420%);
  }
}
</style>