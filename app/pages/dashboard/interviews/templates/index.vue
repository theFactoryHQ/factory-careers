<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const localePath = useLocalePath()
await navigateTo(localePath('/dashboard/emails/templates'), { replace: true })
</script>

<template>
  <div />
</template>
