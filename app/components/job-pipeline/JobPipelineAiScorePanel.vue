<script setup lang="ts">
const props = defineProps<{
  applicationId: string
}>()

const emit = defineEmits<{
  scored: []
}>()
</script>

<template>
  <ScoreBreakdown
    :application-id="props.applicationId"
    @scored="emit('scored')"
  />
</template>