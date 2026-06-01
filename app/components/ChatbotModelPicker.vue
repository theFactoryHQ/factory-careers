<script setup lang="ts">
/**
 * ChatbotModelPicker
 *
 * Sibling of ChatbotAgentPicker. Lets the user pick which AI configuration
 * powers the next message. "Default" sits at the top and resolves server-side
 * (org's default chatbot config). Includes a "Manage models…" entry that
 * emits `manage` so the host can navigate to /dashboard/settings/ai.
 */
import { Brain, Check, ChevronUp, Settings, Star, AlertTriangle } from 'lucide-vue-next'

const { aiConfigs, selectedAiConfigId, currentConversationId, updateConversation } = useChatbot()
const emit = defineEmits<{ manage: [] }>()

const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const modelMenu = useMenuButton({
  id: 'chatbot-model-menu',
  triggerRef,
  menuRef: panelRef,
  closeOnOutside: false,
})
const { floatingStyle } = useFloatingMenu({
  open: modelMenu.isOpen,
  triggerRef,
  placement: 'top-start',
  width: 288,
  estimatedHeight: 360,
  zIndex: 80,
})

const selectedConfig = computed(() =>
  aiConfigs.value.find((c) => c.id === selectedAiConfigId.value) ?? null,
)
const defaultChatbotConfig = computed(() => aiConfigs.value.find((c) => c.isDefaultChatbot) ?? null)

const label = computed(() => {
  if (selectedConfig.value) return selectedConfig.value.name
  if (defaultChatbotConfig.value) return `Default · ${defaultChatbotConfig.value.name}`
  return 'Default model'
})

async function pick(id: string | null) {
  selectedAiConfigId.value = id
  modelMenu.closeMenu({ restoreFocus: true })
  // If we're inside an existing conversation, persist the change so future
  // turns keep using this model even after a reload.
  if (currentConversationId.value) {
    await updateConversation(currentConversationId.value, { aiConfigId: id })
  }
}

function manageModels() {
  modelMenu.closeMenu({ restoreFocus: true })
  emit('manage')
}

useOutsidePointer({
  root: [triggerRef, panelRef],
  active: modelMenu.isOpen,
  onOutside: () => modelMenu.closeMenu(),
})
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-2.5 py-1.5 text-xs font-medium text-surface-700 dark:text-surface-200 hover:border-brand-300 dark:hover:border-brand-700 cursor-pointer transition-colors"
      :title="selectedConfig?.model ?? defaultChatbotConfig?.model ?? 'No model configured'"
      aria-label="Chatbot model"
      v-bind="modelMenu.triggerAttrs.value"
      @click="modelMenu.toggleMenu()"
      @keydown="modelMenu.onTriggerKeydown($event)"
    >
      <Brain class="size-3.5 text-brand-500" />
      <span class="max-w-[160px] truncate">{{ label }}</span>
      <ChevronUp class="size-3 transition-transform" :class="modelMenu.isOpen.value ? '' : 'rotate-180'" />
    </button>

    <Teleport to="body">
      <div
        v-if="modelMenu.isOpen.value"
        id="chatbot-model-menu"
        ref="panelRef"
        class="ui-floating-menu factory-dashboard-portal rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 max-h-[60vh] overflow-y-auto"
        :style="floatingStyle"
        role="menu"
        @keydown="modelMenu.onMenuKeydown"
      >
        <!-- Default entry -->
        <button
          type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer border-0 bg-transparent"
          role="menuitemradio"
          :aria-checked="selectedAiConfigId === null"
          @click="pick(null)"
        >
          <Check
            class="size-3.5 mt-0.5 shrink-0"
            :class="selectedAiConfigId === null ? 'text-brand-500' : 'invisible'"
          />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-surface-800 dark:text-surface-100">
              Org default
            </div>
            <div class="text-[11px] text-surface-500 truncate">
              <template v-if="defaultChatbotConfig">
                Currently {{ defaultChatbotConfig.name }} · <span class="font-mono">{{ defaultChatbotConfig.model }}</span>
              </template>
              <template v-else>
                No default configured yet
              </template>
            </div>
          </div>
        </button>

        <div v-if="aiConfigs.length" class="my-1 border-t border-surface-200 dark:border-surface-800" />

        <!-- Per-config entries -->
        <button
          v-for="c in aiConfigs"
          :key="c.id"
          type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer border-0 bg-transparent"
          :disabled="!c.hasApiKey"
          :class="!c.hasApiKey ? 'opacity-60 cursor-not-allowed' : ''"
          :title="!c.hasApiKey ? 'Missing API key' : c.model"
          role="menuitemradio"
          :aria-checked="selectedAiConfigId === c.id"
          @click="c.hasApiKey ? pick(c.id) : null"
        >
          <Check
            class="size-3.5 mt-0.5 shrink-0"
            :class="selectedAiConfigId === c.id ? 'text-brand-500' : 'invisible'"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <span class="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{{ c.name }}</span>
              <Star v-if="c.isDefaultChatbot" class="size-3 shrink-0 text-warning-500" />
              <AlertTriangle v-if="!c.hasApiKey" class="size-3 shrink-0 text-danger-500" />
            </div>
            <div class="truncate text-[11px] text-surface-500 font-mono">{{ c.model }}</div>
          </div>
        </button>

        <div class="my-1 border-t border-surface-200 dark:border-surface-800" />
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/30 cursor-pointer border-0 bg-transparent"
          role="menuitem"
          @click="manageModels"
        >
          <Settings class="size-3.5" />
          Manage models…
        </button>
      </div>
    </Teleport>
  </div>
</template>
