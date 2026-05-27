<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  inlinePanel?: boolean
}>()

const { orgs, activeOrg, switchOrg } = useCurrentOrg()
const isOpen = ref(false)
const isSwitching = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const { floatingStyle } = useFloatingMenu({
  open: isOpen,
  triggerRef,
  width: 240,
  estimatedHeight: 240,
  zIndex: 90,
})

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
  const target = e.target as Node
  if (switcherRef.value?.contains(target) || panelRef.value?.contains(target)) return
  isOpen.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div ref="switcherRoot" class="relative">
    <button
      ref="triggerRef"
      class="flex h-8 items-center justify-between w-full border border-white/14 bg-black/35 px-3 text-left text-[13px] font-medium text-white/72 transition-colors cursor-pointer hover:border-brand-500/60 hover:text-white"
      @click="isOpen = !isOpen"
    >
      <ClientOnly fallback="Select org">
        <span class="truncate">{{ activeOrg?.name ?? 'Select org' }}</span>
      </ClientOnly>
      <ChevronDown class="ml-2 size-3 text-white/45 transition-transform duration-150" :class="{ 'rotate-180': isOpen }" />
    </button>

    <div
      v-if="isOpen && props.inlinePanel"
      ref="panelRef"
      class="relative z-50 mt-1 max-h-56 w-full overflow-y-auto border border-white/12 bg-black shadow-2xl shadow-black/50"
    >
      <div class="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white/38">
        Organization
      </div>

      <div v-if="isSwitching" class="px-3 py-3 text-center text-[13px] text-white/50">
        Switching…
      </div>
      <template v-else>
        <button
          v-for="org in orgs"
          :key="org.id"
          class="block w-full border-0 bg-transparent px-3 py-2 text-left text-[13px] text-white/68 transition-colors cursor-pointer hover:bg-white/[0.05] hover:text-white"
          :class="org.id === activeOrg?.id
            ? 'bg-brand-500/12 text-white font-medium'
            : ''"
          @click="handleSwitch(org.id)"
        >
          {{ org.name }}
        </button>

        <NuxtLink
          :to="$localePath('/onboarding/create-org')"
          class="block w-full border-t border-white/10 px-3 py-2 text-left text-xs text-white/45 no-underline transition-colors cursor-pointer hover:bg-white/[0.05] hover:text-white"
          @click="isOpen = false"
        >
          + Create organization
        </NuxtLink>
      </template>
    </div>
    <Teleport v-else-if="isOpen" to="body">
      <div
        ref="panelRef"
        class="z-50 w-max min-w-60 overflow-hidden border border-white/12 bg-black shadow-2xl shadow-black/50"
        :style="floatingStyle"
      >
        <div class="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white/38">
          Organization
        </div>

        <div v-if="isSwitching" class="px-3 py-3 text-center text-[13px] text-white/50">
          Switching…
        </div>
        <template v-else>
          <button
            v-for="org in orgs"
            :key="org.id"
            class="block w-full border-0 bg-transparent px-3 py-2 text-left text-[13px] text-white/68 transition-colors cursor-pointer hover:bg-white/[0.05] hover:text-white"
            :class="org.id === activeOrg?.id
              ? 'bg-brand-500/12 text-white font-medium'
              : ''"
            @click="handleSwitch(org.id)"
          >
            {{ org.name }}
          </button>

          <NuxtLink
            :to="$localePath('/onboarding/create-org')"
            class="block w-full border-t border-white/10 px-3 py-2 text-left text-xs text-white/45 no-underline transition-colors cursor-pointer hover:bg-white/[0.05] hover:text-white"
            @click="isOpen = false"
          >
            + Create organization
          </NuxtLink>
        </template>
      </div>
    </Teleport>
  </div>
</template>
