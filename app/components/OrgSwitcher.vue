<script setup lang="ts">
const { orgs, activeOrg, switchOrg } = useCurrentOrg()
const isOpen = ref(false)
const isSwitching = ref(false)

async function handleSwitch(orgId: string) {
  if (orgId === activeOrg.value?.id) {
    isOpen.value = false
    return
  }

  isSwitching.value = true
  try {
    await switchOrg(orgId)
  } catch {
    isSwitching.value = false
  }
}

/** Close dropdown on outside click */
const switcherRef = useTemplateRef<HTMLElement>('switcherRoot')

function onClickOutside(e: MouseEvent) {
  if (switcherRef.value && !switcherRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div ref="switcherRoot" class="relative">
    <button
      class="ui-menu-trigger flex w-full items-center justify-between px-3 py-2 text-[13px]"
      @click="isOpen = !isOpen"
    >
      <ClientOnly fallback="Select org">
        <span class="truncate">{{ activeOrg?.name ?? 'Select org' }}</span>
      </ClientOnly>
      <span class="text-[10px] text-surface-500 dark:text-surface-400">{{ isOpen ? '▲' : '▼' }}</span>
    </button>

    <div
      v-if="isOpen"
      class="ui-floating-menu absolute top-[calc(100%+4px)] left-0 min-w-full w-max z-50 overflow-hidden"
    >
      <div v-if="isSwitching" class="px-3 py-3 text-center text-[13px] text-surface-500 dark:text-surface-400">
        Switching…
      </div>
      <template v-else>
        <button
          v-for="org in orgs"
          :key="org.id"
          class="ui-menu-action block px-3 py-2 text-[13px]"
          :class="org.id === activeOrg?.id
            ? 'ui-menu-action-active'
            : ''"
          @click="handleSwitch(org.id)"
        >
          {{ org.name }}
        </button>

        <div class="ui-menu-divider" />
        <NuxtLink
          :to="$localePath('/onboarding/create-org')"
          class="ui-menu-action block px-3 py-2 text-xs no-underline"
          @click="isOpen = false"
        >
          + Create organization
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
