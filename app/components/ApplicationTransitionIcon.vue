<script setup lang="ts">
import {
  ArchiveRestore,
  BadgeCheck,
  BriefcaseBusiness,
  Calendar,
  CircleX,
  ScanSearch,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { ApplicationStatusKey } from '~/utils/status-display'

const props = defineProps<{
  status: string
}>()

const statusIcons: Record<ApplicationStatusKey, Component> = {
  new: ArchiveRestore,
  screening: ScanSearch,
  interview: Calendar,
  offer: BriefcaseBusiness,
  hired: BadgeCheck,
  rejected: CircleX,
}

const icon = computed(() => statusIcons[props.status as ApplicationStatusKey] ?? ScanSearch)
</script>

<template>
  <component
    :is="icon"
    class="factory-application-transition-icon size-3 shrink-0"
    aria-hidden="true"
  />
</template>
