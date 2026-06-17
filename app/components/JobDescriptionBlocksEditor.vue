<script setup lang="ts">
import { List, Plus, Trash2, Type } from 'lucide-vue-next'
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

function emitBlocks(next: JobDescriptionBlock[]) {
  emit('update:modelValue', next.length > 0 ? next : [emptyParagraph()])
}

function updateBlock(index: number, block: JobDescriptionBlock) {
  const next = [...blocks.value]
  next[index] = block
  emitBlocks(next)
}

function setBlockType(index: number, type: JobDescriptionBlock['type']) {
  const current = blocks.value[index]
  if (current?.type === type) return
  updateBlock(index, type === 'paragraph' ? emptyParagraph() : emptyBulletList())
}

function addBlock(type: JobDescriptionBlock['type']) {
  emitBlocks([...blocks.value, type === 'paragraph' ? emptyParagraph() : emptyBulletList()])
}

function removeBlock(index: number) {
  emitBlocks(blocks.value.filter((_, blockIndex) => blockIndex !== index))
}

function updateParagraph(index: number, body: string) {
  updateBlock(index, { type: 'paragraph', body })
}

function updateBulletHeading(index: number, heading: string) {
  const block = blocks.value[index]
  if (block?.type !== 'bullet_list') return
  updateBlock(index, { ...block, heading })
}

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
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="(block, index) in blocks"
      :key="index"
      class="group/description-block rounded-md border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-950"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="inline-flex overflow-hidden rounded-md border border-surface-200 dark:border-surface-700">
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors"
            :class="block.type === 'paragraph'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
              : 'text-surface-500 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-900'"
            @click="setBlockType(index, 'paragraph')"
          >
            <Type class="size-3.5" />
            Paragraph
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 border-l border-surface-200 px-2.5 text-xs font-medium transition-colors dark:border-surface-700"
            :class="block.type === 'bullet_list'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
              : 'text-surface-500 hover:bg-surface-50 dark:text-surface-400 dark:hover:bg-surface-900'"
            @click="setBlockType(index, 'bullet_list')"
          >
            <List class="size-3.5" />
            Bullets
          </button>
        </div>

        <button
          v-if="blocks.length > 1"
          type="button"
          class="ui-button-ghost inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-surface-400 opacity-0 transition-opacity hover:text-danger-600 focus:opacity-100 group-hover/description-block:opacity-100 group-focus-within/description-block:opacity-100 dark:hover:text-danger-400"
          aria-label="Remove description section"
          title="Remove section"
          @click="removeBlock(index)"
        >
          <Trash2 class="size-3.5" />
          Remove
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
        <input
          :value="block.heading"
          type="text"
          placeholder="Section heading"
          class="ui-field px-3 py-2 text-sm font-medium"
          @input="updateBulletHeading(index, ($event.target as HTMLInputElement).value)"
        />
        <div class="space-y-2">
          <div
            v-for="(item, itemIndex) in block.items"
            :key="itemIndex"
            class="group/bullet-row flex items-center gap-2"
          >
            <input
              :value="item"
              type="text"
              placeholder="Bullet point"
              class="ui-field px-3 py-2 text-sm"
              @input="updateBulletItem(index, itemIndex, ($event.target as HTMLInputElement).value)"
            />
            <button
              v-if="block.items.length > 1"
              type="button"
              class="ui-button-ghost inline-flex size-9 shrink-0 items-center justify-center rounded-md text-surface-400 opacity-0 transition-opacity hover:text-danger-600 focus:opacity-100 group-hover/bullet-row:opacity-100 group-focus-within/bullet-row:opacity-100 dark:hover:text-danger-400"
              aria-label="Remove bullet point"
              title="Remove bullet"
              @click="removeBulletItem(index, itemIndex)"
            >
              <Trash2 class="size-4" />
            </button>
            <span v-else class="size-9 shrink-0" aria-hidden="true" />
          </div>
        </div>
        <button
          type="button"
          class="ui-button ui-button-secondary h-8 px-3 text-xs"
          @click="addBulletItem(index)"
        >
          <Plus class="size-3.5" />
          Add bullet
        </button>
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
