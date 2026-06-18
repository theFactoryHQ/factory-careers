<script setup lang="ts">
import { ChevronDown, GripVertical, List, Plus, Trash2, Type, X } from 'lucide-vue-next'
import {
  captureBlockTypeDraft as captureDraftFromBlock,
  createBlockFromDraft,
  reindexBlockTypeDraftsAfterRemoval,
  type BlockTypeDraftsByIndex,
} from '~/utils/jobDescriptionBlockTypeDrafts'
import type { JobDescriptionBlock } from '~~/shared/job-listing-structure'

const props = defineProps<{
  modelValue?: JobDescriptionBlock[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: JobDescriptionBlock[]]
}>()

function emptyParagraph(): JobDescriptionBlock {
  return { type: 'paragraph', body: '' }
}

function emptyBulletList(): JobDescriptionBlock {
  return { type: 'bullet_list', heading: '', items: [''] }
}

const blocks = computed(() => {
  return props.modelValue && props.modelValue.length > 0 ? props.modelValue : [emptyParagraph()]
})
const draggingBullet = ref<{ blockIndex: number, itemIndex: number } | null>(null)
const collapsedBlockIndexes = ref<Set<number>>(new Set())
const blockTypeDrafts = ref<BlockTypeDraftsByIndex>({})
const editorRef = ref<HTMLElement | null>(null)

watch(() => blocks.value.length, (length) => {
  const next = new Set([...collapsedBlockIndexes.value].filter((index) => index < length))
  if (next.size !== collapsedBlockIndexes.value.size) collapsedBlockIndexes.value = next
})

function emitBlocks(next: JobDescriptionBlock[]) {
  emit('update:modelValue', next.length > 0 ? next : [emptyParagraph()])
}

function updateBlock(index: number, block: JobDescriptionBlock) {
  const next = [...blocks.value]
  next[index] = block
  emitBlocks(next)
}

function captureBlockTypeDraft(index: number, block = blocks.value[index]) {
  const currentDraft = blockTypeDrafts.value[index] ?? {}
  if (!block) return currentDraft

  const nextDraft = captureDraftFromBlock(currentDraft, block)
  blockTypeDrafts.value = { ...blockTypeDrafts.value, [index]: nextDraft }
  return nextDraft
}

function setBlockType(index: number, type: JobDescriptionBlock['type']) {
  const current = blocks.value[index]
  if (current?.type === type) return
  const draft = captureBlockTypeDraft(index, current)
  updateBlock(index, createBlockFromDraft(type, draft, current))
}

function addBlock(type: JobDescriptionBlock['type']) {
  emitBlocks([...blocks.value, type === 'paragraph' ? emptyParagraph() : emptyBulletList()])
}

function removeBlock(index: number) {
  emitBlocks(blocks.value.filter((_, blockIndex) => blockIndex !== index))
  collapsedBlockIndexes.value = new Set([...collapsedBlockIndexes.value].flatMap((collapsedIndex) => {
    if (collapsedIndex === index) return []
    return [collapsedIndex > index ? collapsedIndex - 1 : collapsedIndex]
  }))
  blockTypeDrafts.value = reindexBlockTypeDraftsAfterRemoval(blockTypeDrafts.value, index)
}

function updateParagraph(index: number, body: string) {
  const block = blocks.value[index]
  if (block?.type !== 'paragraph') return
  updateBlock(index, { ...block, body })
}

function updateBlockHeading(index: number, heading: string) {
  const block = blocks.value[index]
  if (!block) return

  if (block.type === 'paragraph') {
    const nextBlock = heading ? { ...block, heading } : { type: 'paragraph' as const, body: block.body }
    updateBlock(index, nextBlock)
    return
  }

  updateBlock(index, { ...block, heading })
}

function validateBlockHeadingInput(input: HTMLInputElement) {
  input.setCustomValidity(input.value.trim() ? '' : 'Add a title for this description section.')
}

function onBlockHeadingInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  validateBlockHeadingInput(input)
  updateBlockHeading(index, input.value)
}

function reportValidity() {
  const headingInputs = editorRef.value
    ? [...editorRef.value.querySelectorAll<HTMLInputElement>('[data-testid="description-block-heading-input"]')]
    : []

  for (const input of headingInputs) {
    validateBlockHeadingInput(input)
  }

  const firstInvalid = editorRef.value?.querySelector<HTMLInputElement>('[data-testid="description-block-heading-input"]:invalid')
  if (!firstInvalid) return true

  firstInvalid.reportValidity()
  firstInvalid.focus()
  return false
}

defineExpose({ reportValidity })

function updateBulletItem(blockIndex: number, itemIndex: number, value: string) {
  const block = blocks.value[blockIndex]
  if (block?.type !== 'bullet_list') return
  const items = [...block.items]
  items[itemIndex] = value
  updateBlock(blockIndex, { ...block, items })
}

function addBulletItem(blockIndex: number) {
  const block = blocks.value[blockIndex]
  if (block?.type !== 'bullet_list') return
  updateBlock(blockIndex, { ...block, items: [...block.items, ''] })
}

function removeBulletItem(blockIndex: number, itemIndex: number) {
  const block = blocks.value[blockIndex]
  if (block?.type !== 'bullet_list') return
  const items = block.items.filter((_, index) => index !== itemIndex)
  updateBlock(blockIndex, { ...block, items: items.length > 0 ? items : [''] })
}

function moveBulletItem(blockIndex: number, fromIndex: number, toIndex: number) {
  const block = blocks.value[blockIndex]
  if (block?.type !== 'bullet_list' || fromIndex === toIndex) return
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= block.items.length || toIndex >= block.items.length) return

  const items = [...block.items]
  const [item] = items.splice(fromIndex, 1)
  if (item === undefined) return
  items.splice(toIndex, 0, item)
  updateBlock(blockIndex, { ...block, items })
}

function onBulletDragStart(event: DragEvent, blockIndex: number, itemIndex: number) {
  draggingBullet.value = { blockIndex, itemIndex }
  event.dataTransfer?.setData('text/plain', `${blockIndex}:${itemIndex}`)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onBulletDragOver(event: DragEvent) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onBulletDrop(event: DragEvent, blockIndex: number, itemIndex: number) {
  const dragged = draggingBullet.value
  draggingBullet.value = null
  if (!dragged || dragged.blockIndex !== blockIndex) return
  event.preventDefault()
  moveBulletItem(blockIndex, dragged.itemIndex, itemIndex)
}

function onBulletDragEnd() {
  draggingBullet.value = null
}

function isBlockCollapsed(index: number) {
  return collapsedBlockIndexes.value.has(index)
}

function toggleBlockCollapsed(index: number) {
  const next = new Set(collapsedBlockIndexes.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  collapsedBlockIndexes.value = next
}

function getBlockHeadingValue(block: JobDescriptionBlock) {
  return block.heading ?? ''
}

function getBlockHeadingPlaceholder(block: JobDescriptionBlock) {
  return block.type === 'paragraph' ? 'Paragraph' : 'Bullet section'
}
</script>

<template>
  <div ref="editorRef" class="space-y-3">
    <div
      v-for="(block, index) in blocks"
      :key="index"
      class="group/description-block relative rounded-md border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-950"
    >
      <div class="flex items-start gap-2 pr-9">
        <button
          type="button"
          class="group/block-toggle inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-[background-color,box-shadow,color] hover:bg-brand-50/80 hover:ring-1 hover:ring-brand-500/25 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:hover:bg-brand-950/40 dark:hover:ring-brand-500/30"
          :aria-expanded="!isBlockCollapsed(index)"
          :aria-controls="`job-description-block-${index}`"
          aria-label="Toggle description section"
          @click="toggleBlockCollapsed(index)"
        >
          <ChevronDown
            class="size-4 shrink-0 text-surface-400 transition-transform"
            :class="isBlockCollapsed(index) ? '-rotate-90' : 'rotate-0'"
          />
          <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-100 text-xs font-semibold text-surface-500 transition-colors group-hover/block-toggle:bg-brand-100 group-hover/block-toggle:text-brand-700 dark:bg-surface-800 dark:text-surface-300 dark:group-hover/block-toggle:bg-brand-900/50 dark:group-hover/block-toggle:text-brand-200">
            {{ index + 1 }}
          </span>
        </button>
        <input
          data-testid="description-block-heading-input"
          :value="getBlockHeadingValue(block)"
          type="text"
          aria-label="Description section title"
          aria-required="true"
          :placeholder="getBlockHeadingPlaceholder(block)"
          required
          class="factory-description-heading-input min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-surface-900 outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-surface-500 hover:bg-transparent focus:border-brand-500/60 focus:bg-transparent focus:ring-2 focus:ring-brand-500/20 dark:text-surface-100 dark:placeholder:text-surface-400 dark:hover:bg-transparent dark:focus:bg-transparent"
          @click.stop
          @keydown.enter.prevent
          @input="onBlockHeadingInput(index, $event)"
        />

        <button
          v-if="blocks.length > 1"
          type="button"
          class="ui-button ui-button-ghost ui-button-ghost-danger absolute right-3 top-3 z-10 size-8 p-0 text-surface-400 opacity-0 transition-[background-color,color,opacity] hover:bg-danger-50 hover:text-danger-600 focus:opacity-100 group-hover/description-block:opacity-100 group-focus-within/description-block:opacity-100 dark:text-surface-500 dark:hover:bg-danger-950/40 dark:hover:text-danger-300"
          aria-label="Remove description section"
          title="Remove section"
          @click="removeBlock(index)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>

      <div
        v-show="!isBlockCollapsed(index)"
        :id="`job-description-block-${index}`"
        class="mt-3 space-y-3"
      >
        <div class="inline-flex overflow-hidden rounded-md border border-surface-200 dark:border-surface-700">
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center text-xs font-medium transition-colors"
            :class="block.type === 'paragraph'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
              : 'text-surface-500 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-900'"
            :aria-pressed="block.type === 'paragraph'"
            aria-label="Use paragraph block"
            title="Paragraph"
            @click="setBlockType(index, 'paragraph')"
          >
            <Type class="size-3.5" />
          </button>
          <button
            type="button"
            class="inline-flex size-8 items-center justify-center border-l border-surface-200 text-xs font-medium transition-colors dark:border-surface-700"
            :class="block.type === 'bullet_list'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
              : 'text-surface-500 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-900'"
            :aria-pressed="block.type === 'bullet_list'"
            aria-label="Use bullet section block"
            title="Bullets"
            @click="setBlockType(index, 'bullet_list')"
          >
            <List class="size-3.5" />
          </button>
        </div>

        <textarea
          v-if="block.type === 'paragraph'"
          :value="block.body"
          rows="4"
          placeholder="Write a paragraph about the role..."
          class="ui-field resize-y px-3 py-2 text-sm"
          @input="updateParagraph(index, ($event.target as HTMLTextAreaElement).value)"
        />

        <div v-else class="space-y-2">
          <div class="space-y-2">
            <div
              v-for="(item, itemIndex) in block.items"
              :key="itemIndex"
              class="group/bullet-row relative"
              :class="draggingBullet?.blockIndex === index && draggingBullet?.itemIndex === itemIndex ? 'opacity-45' : ''"
              @dragover.prevent="onBulletDragOver"
              @drop="onBulletDrop($event, index, itemIndex)"
            >
              <button
                v-if="block.items.length > 1"
                type="button"
                draggable="true"
                class="absolute left-1.5 top-1/2 z-10 inline-flex size-7 -translate-y-1/2 cursor-grab items-center justify-center rounded-md text-surface-300 opacity-0 transition-colors hover:bg-surface-100 hover:text-surface-600 focus:opacity-100 active:cursor-grabbing group-hover/bullet-row:opacity-100 group-focus-within/bullet-row:opacity-100 dark:text-surface-600 dark:hover:bg-surface-800 dark:hover:text-surface-300"
                aria-label="Reorder bullet point"
                title="Drag to reorder. Use Alt+Up or Alt+Down from here to move with the keyboard."
                @dragstart="onBulletDragStart($event, index, itemIndex)"
                @dragend="onBulletDragEnd"
                @keydown.alt.up.prevent="moveBulletItem(index, itemIndex, itemIndex - 1)"
                @keydown.alt.down.prevent="moveBulletItem(index, itemIndex, itemIndex + 1)"
              >
                <GripVertical class="size-4" />
              </button>
              <input
                :value="item"
                type="text"
                placeholder="Bullet point"
                class="ui-field py-2 text-sm"
                :class="block.items.length > 1 ? 'pl-9 pr-9' : 'px-3'"
                @input="updateBulletItem(index, itemIndex, ($event.target as HTMLInputElement).value)"
              />
              <button
                v-if="block.items.length > 1"
                type="button"
                class="absolute right-1.5 top-1/2 z-10 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-surface-300 opacity-0 transition-colors hover:bg-danger-50 hover:text-danger-600 focus:opacity-100 group-hover/bullet-row:opacity-100 group-focus-within/bullet-row:opacity-100 dark:text-surface-600 dark:hover:bg-danger-950/40 dark:hover:text-danger-300"
                aria-label="Remove bullet point"
                title="Remove bullet"
                @click="removeBulletItem(index, itemIndex)"
              >
                <X class="size-3.5" />
              </button>
            </div>
          </div>
          <div class="flex pt-1 pl-8">
            <button
              type="button"
              data-testid="add-bullet-inline-action"
              class="group/add-bullet inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent px-1.5 pr-2 text-xs font-medium text-surface-500 transition-[background-color,border-color,color] hover:border-surface-200 hover:bg-surface-50 hover:text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:text-surface-400 dark:hover:border-surface-700 dark:hover:bg-surface-900/70 dark:hover:text-surface-100"
              aria-label="Add bullet point"
              @click="addBulletItem(index)"
            >
              <span class="inline-flex size-4 items-center justify-center rounded-full bg-surface-100 text-surface-500 transition-colors group-hover/add-bullet:bg-brand-500/10 group-hover/add-bullet:text-brand-600 dark:bg-surface-800 dark:text-surface-400 dark:group-hover/add-bullet:text-brand-300">
                <Plus class="size-3" />
              </span>
              <span>Add</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="ui-button ui-button-secondary h-9 px-3 text-sm"
        @click="addBlock('paragraph')"
      >
        <Plus class="size-4" />
        Paragraph
      </button>
      <button
        type="button"
        class="ui-button ui-button-secondary h-9 px-3 text-sm"
        @click="addBlock('bullet_list')"
      >
        <Plus class="size-4" />
        Bullet section
      </button>
    </div>
  </div>
</template>
