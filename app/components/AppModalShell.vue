<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  teleportTo?: string | HTMLElement
  layout?: 'grid' | 'flex'
  paddingClass?: string
  zIndexClass?: string
  closeOnBackdrop?: boolean
  ariaLabel?: string
}>(), {
  teleportTo: 'body',
  layout: 'grid',
  paddingClass: 'p-4',
  zIndexClass: 'z-50',
  closeOnBackdrop: true,
  ariaLabel: 'Dialog',
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const attrs = useAttrs()
const shellRef = ref<HTMLElement | null>(null)

const shellAttrs = computed(() => {
  const { class: _class, ...rest } = attrs
  const hasAccessibleName = rest['aria-label'] || rest['aria-labelledby']
  return {
    role: 'dialog',
    'aria-modal': true,
    ...(hasAccessibleName ? {} : { 'aria-label': props.ariaLabel }),
    ...rest,
  }
})

const shellClasses = computed(() => [
  'factory-dashboard-portal ui-modal-backdrop fixed inset-0',
  props.zIndexClass,
  props.layout === 'grid' ? 'grid place-items-center' : 'flex items-center justify-center',
  props.paddingClass,
  attrs.class,
])

function handleBackdropClick() {
  if (props.closeOnBackdrop) {
    emit('close')
  }
}

useFocusTrap({
  root: shellRef,
  active: true,
  onEscape: () => emit('close'),
})
</script>

<template>
  <Teleport :to="teleportTo">
    <div
      ref="shellRef"
      v-bind="shellAttrs"
      :class="shellClasses"
      tabindex="-1"
      @click.self="handleBackdropClick"
    >
      <slot />
    </div>
  </Teleport>
</template>
