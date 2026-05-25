<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const localePath = useLocalePath()
await navigateTo(localePath(`/dashboard/emails/templates/${route.params.id}`), { replace: true })
</script>

<template>
  <div />
</template>
