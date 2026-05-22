<script setup lang="ts">
import { X, AlertTriangle, CheckCircle, Info, AlertCircle, ExternalLink, ChevronDown } from 'lucide-vue-next'
import type { Toast } from '~/composables/useToast'

const { toasts, remove } = useToast()

const expandedToasts = ref(new Set<string>())

function toggleDetails(id: string) {
  if (expandedToasts.value.has(id)) {
    expandedToasts.value.delete(id)
  } else {
    expandedToasts.value.add(id)
  }
}

const typeConfig: Record<string, { icon: typeof AlertTriangle; iconBoxClass: string; iconClass: string; accentClass: string }> = {
  error: {
    icon: AlertCircle,
    iconBoxClass: 'border-danger-500/40 bg-danger-500/12',
    iconClass: 'text-danger-300',
    accentClass: 'bg-danger-500',
  },
  success: {
    icon: CheckCircle,
    iconBoxClass: 'border-success-500/35 bg-success-500/12',
    iconClass: 'text-success-300',
    accentClass: 'bg-success-500',
  },
  warning: {
    icon: AlertTriangle,
    iconBoxClass: 'border-warning-500/40 bg-warning-500/12',
    iconClass: 'text-warning-300',
    accentClass: 'bg-warning-500',
  },
  info: {
    icon: Info,
    iconBoxClass: 'border-brand-500/45 bg-brand-500/14',
    iconClass: 'text-brand-300',
    accentClass: 'bg-brand-500',
  },
}

function getConfig(type: string) {
  return typeConfig[type] ?? typeConfig.info!
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-[420px] flex-col-reverse gap-2.5 pointer-events-none sm:bottom-5 sm:right-5"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 translate-y-3 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-3 scale-95"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto overflow-hidden border border-white/14 bg-black shadow-2xl shadow-black/70"
        >
          <!-- Accent bar -->
          <div class="h-1" :class="getConfig(toast.type).accentClass" />

          <div class="p-4">
            <div class="flex items-start gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center border"
                :class="getConfig(toast.type).iconBoxClass"
              >
                <component
                  :is="getConfig(toast.type).icon"
                  class="size-4"
                  :class="getConfig(toast.type).iconClass"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold leading-snug text-white">
                  {{ toast.title }}
                </p>
                <p
                  v-if="toast.message"
                  class="mt-1 text-xs leading-relaxed text-white/58"
                >
                  {{ toast.message }}
                </p>

                <!-- Expandable details toggle -->
                <button
                  v-if="toast.details"
                  type="button"
                  class="mt-2 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-xs font-medium text-white/50 transition-colors hover:text-white"
                  @click="toggleDetails(toast.id)"
                >
                  <ChevronDown
                    class="size-3.5 transition-transform duration-200"
                    :class="{ 'rotate-180': expandedToasts.has(toast.id) }"
                  />
                  {{ expandedToasts.has(toast.id) ? 'Hide details' : 'Show details' }}
                </button>

                <!-- Expanded details -->
                <div
                  v-if="toast.details && expandedToasts.has(toast.id)"
                  class="mt-2 max-h-40 overflow-y-auto border border-white/12 bg-white/[0.04] p-2.5 font-mono text-[11px] leading-relaxed text-white/56 break-all"
                >
                  {{ toast.details }}
                </div>

                <div v-if="toast.link" class="mt-2.5">
                  <a
                    :href="toast.link.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200"
                  >
                    {{ toast.link.label }}
                    <ExternalLink class="size-3" />
                  </a>
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 border border-transparent bg-transparent p-1 text-white/42 transition-colors hover:border-white/12 hover:bg-white/[0.04] hover:text-white"
                @click="remove(toast.id)"
              >
                <X class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
