<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer
    data-slot="dashboard-footer"
    class="shrink-0 pt-10 text-xs font-medium text-white/35"
  >
    &copy; Factory {{ year }}
  </footer>
</template>
