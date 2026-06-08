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
import { Sparkles, Star, Check } from 'lucide-vue-next'

const { agents, selectedAgentId } = useChatbot()
const emit = defineEmits<{ manage: [] }>()

const pickerRef = ref<{ closeMenu: (options?: { restoreFocus?: boolean }) => void } | null>(null)

const selectedAgent = computed(() =>
  agents.value.find((a) => a.id === selectedAgentId.value) ?? null,
)
const label = computed(() => selectedAgent.value?.name ?? 'Default assistant')

function pick(id: string | null) {
  selectedAgentId.value = id
  pickerRef.value?.closeMenu()
}

function manageAgents() {
  pickerRef.value?.closeMenu()
  emit('manage')
}
</script>

<template>
  <ChatbotPickerMenu
    ref="pickerRef"
    id="chatbot-agent-menu"
    :label="label"
    :icon="Sparkles"
    menu-aria-label="Chatbot agent"
    :width="256"
    :estimated-height="320"
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
  </ChatbotPickerMenu>
</template>