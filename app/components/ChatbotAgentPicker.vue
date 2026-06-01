<script setup lang="ts">
/**
 * ChatbotAgentPicker
 *
 * Compact dropdown anchored next to the message input. Lets the user pick
 * which custom agent (system-prompt persona) handles the next message.
 *   - "Default assistant" (no agent) sits at the top.
 *   - User-defined agents are listed by name, with the default-flagged one
 *     showing a star.
 *   - "Manage agents…" opens the manager modal via emit('manage').
 */
import { Sparkles, Star, Check, ChevronUp } from 'lucide-vue-next'

const { agents, selectedAgentId } = useChatbot()
const emit = defineEmits<{ manage: [] }>()

const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const agentMenu = useMenuButton({
  id: 'chatbot-agent-menu',
  triggerRef,
  menuRef: panelRef,
  closeOnOutside: false,
})
const { floatingStyle } = useFloatingMenu({
  open: agentMenu.isOpen,
  triggerRef,
  placement: 'top-start',
  width: 256,
  estimatedHeight: 320,
  zIndex: 80,
})

const selectedAgent = computed(() =>
  agents.value.find((a) => a.id === selectedAgentId.value) ?? null,
)
const label = computed(() => selectedAgent.value?.name ?? 'Default assistant')

function pick(id: string | null) {
  selectedAgentId.value = id
  agentMenu.closeMenu({ restoreFocus: true })
}

function manageAgents() {
  agentMenu.closeMenu({ restoreFocus: true })
  emit('manage')
}

useOutsidePointer({
  root: [triggerRef, panelRef],
  active: agentMenu.isOpen,
  onOutside: () => agentMenu.closeMenu(),
})
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-2.5 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-200 hover:border-brand-300 dark:hover:border-brand-700 cursor-pointer transition-colors"
      aria-label="Chatbot agent"
      v-bind="agentMenu.triggerAttrs.value"
      @click="agentMenu.toggleMenu()"
      @keydown="agentMenu.onTriggerKeydown($event)"
    >
      <Sparkles class="size-3.5 text-brand-500" />
      <span class="max-w-[140px] truncate">{{ label }}</span>
      <ChevronUp class="size-3 transition-transform" :class="agentMenu.isOpen.value ? '' : 'rotate-180'" />
    </button>

    <Teleport to="body">
      <div
        v-if="agentMenu.isOpen.value"
        id="chatbot-agent-menu"
        ref="panelRef"
        class="ui-floating-menu factory-dashboard-portal rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1"
        :style="floatingStyle"
        role="menu"
        @keydown="agentMenu.onMenuKeydown"
      >
        <button
          type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer border-0 bg-transparent"
          role="menuitemradio"
          :aria-checked="selectedAgentId === null"
          @click="pick(null)"
        >
          <Check
            class="size-3.5 mt-0.5 shrink-0"
            :class="selectedAgentId === null ? 'text-brand-500' : 'invisible'"
          />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-surface-800 dark:text-surface-100">
              Default assistant
            </div>
            <div class="text-[11px] text-surface-500">No custom system prompt</div>
          </div>
        </button>

        <div v-if="agents.length" class="my-1 border-t border-surface-200 dark:border-surface-800" />

        <button
          v-for="a in agents"
          :key="a.id"
          type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer border-0 bg-transparent"
          role="menuitemradio"
          :aria-checked="selectedAgentId === a.id"
          @click="pick(a.id)"
        >
          <Check
            class="size-3.5 mt-0.5 shrink-0"
            :class="selectedAgentId === a.id ? 'text-brand-500' : 'invisible'"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <span class="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{{ a.name }}</span>
              <Star v-if="a.isDefault" class="size-3 shrink-0 text-warning-500" />
            </div>
            <div v-if="a.description" class="truncate text-[11px] text-surface-500">{{ a.description }}</div>
          </div>
        </button>

        <div class="my-1 border-t border-surface-200 dark:border-surface-800" />
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/30 cursor-pointer border-0 bg-transparent"
          role="menuitem"
          @click="manageAgents"
        >
          <Sparkles class="size-3.5" />
          Manage agents…
        </button>
      </div>
    </Teleport>
  </div>
</template>
