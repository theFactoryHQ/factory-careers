<script setup lang="ts">
withDefaults(defineProps<{
  status: string
  label?: string
}>(), {
  label: undefined,
})
</script>

<template>
  <span
    class="factory-application-status-badge inline-flex h-8 min-h-8 shrink-0 items-center border px-2.5 py-0 text-[11px] font-semibold uppercase leading-none tracking-normal"
    :class="getApplicationStatusBadgeClass(status, 'factory')"
  >
    <slot>
      {{ label ?? getApplicationStatusLabel(status) }}
    </slot>
  </span>
</template>
