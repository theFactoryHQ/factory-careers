<script setup lang="ts">
import { Calendar } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  appliedAt: string | Date
  updatedAt?: string | Date | null
  floating?: boolean
}>(), {
  updatedAt: null,
  floating: false,
})

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString()
}

const showUpdated = computed(() =>
  Boolean(props.updatedAt) && new Date(props.updatedAt!).getTime() !== new Date(props.appliedAt).getTime(),
)
</script>

<template>
  <div
    class="factory-application-timestamps flex shrink-0 flex-col items-start gap-1 text-xs sm:items-end"
    :class="{ 'sm:absolute sm:right-5 sm:top-5': floating }"
  >
    <TimelineDateLink
      :date="appliedAt"
      class="factory-application-timestamp-link inline-flex items-center gap-1.5"
    >
      <Calendar class="factory-application-timestamp-icon size-3.5" />
      <span class="factory-application-timestamp-label">Applied</span>
      <span class="factory-application-timestamp-value">{{ formatDate(appliedAt) }}</span>
    </TimelineDateLink>
    <TimelineDateLink
      v-if="showUpdated && updatedAt"
      :date="updatedAt"
      class="factory-application-timestamp-link factory-application-timestamp-link-offset inline-flex items-center gap-1.5"
    >
      <span class="factory-application-timestamp-label">Updated</span>
      <span class="factory-application-timestamp-value">{{ formatDate(updatedAt) }}</span>
    </TimelineDateLink>
  </div>
</template>
