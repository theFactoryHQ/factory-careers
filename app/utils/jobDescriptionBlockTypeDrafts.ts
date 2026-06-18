import type { JobDescriptionBlock } from '~~/shared/job-listing-structure'

export type BlockTypeDraft = {
  paragraphHeading?: string
  paragraphBody?: string
  bulletHeading?: string
  bulletItems?: string[]
}

export type BlockTypeDraftsByIndex = Record<number, BlockTypeDraft>

function hasDraftValue(draft: BlockTypeDraft, key: keyof BlockTypeDraft) {
  return Object.prototype.hasOwnProperty.call(draft, key)
}

function normalizeDraftBulletItems(items?: string[]) {
  return items && items.length > 0 ? [...items] : ['']
}

function paragraphBodyToBulletItems(body: string) {
  const items = body
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)

  return items.length > 0 ? items : ['']
}

function bulletBlockToParagraphBody(block: Extract<JobDescriptionBlock, { type: 'bullet_list' }>) {
  return block.items
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function captureBlockTypeDraft(draft: BlockTypeDraft, block: JobDescriptionBlock): BlockTypeDraft {
  return block.type === 'paragraph'
    ? { ...draft, paragraphHeading: block.heading, paragraphBody: block.body }
    : { ...draft, bulletHeading: block.heading, bulletItems: [...block.items] }
}

export function createBlockFromDraft(
  type: JobDescriptionBlock['type'],
  draft: BlockTypeDraft,
  fallbackBlock?: JobDescriptionBlock,
): JobDescriptionBlock {
  if (type === 'paragraph') {
    const heading = hasDraftValue(draft, 'paragraphHeading')
      ? draft.paragraphHeading ?? ''
      : fallbackBlock?.type === 'bullet_list'
        ? fallbackBlock.heading
        : ''
    const block: Extract<JobDescriptionBlock, { type: 'paragraph' }> = {
      type: 'paragraph',
      body: hasDraftValue(draft, 'paragraphBody')
        ? draft.paragraphBody ?? ''
        : fallbackBlock?.type === 'bullet_list'
          ? bulletBlockToParagraphBody(fallbackBlock)
          : '',
    }
    return heading ? { ...block, heading } : block
  }

  return {
    type: 'bullet_list',
    heading: hasDraftValue(draft, 'bulletHeading')
      ? draft.bulletHeading ?? ''
      : fallbackBlock?.type === 'paragraph'
        ? fallbackBlock.heading ?? ''
        : '',
    items: hasDraftValue(draft, 'bulletItems')
      ? normalizeDraftBulletItems(draft.bulletItems)
      : fallbackBlock?.type === 'paragraph'
        ? paragraphBodyToBulletItems(fallbackBlock.body)
        : [''],
  }
}

export function reindexBlockTypeDraftsAfterRemoval(
  drafts: BlockTypeDraftsByIndex,
  removedIndex: number,
): BlockTypeDraftsByIndex {
  return Object.fromEntries(Object.entries(drafts).flatMap(([draftIndex, draft]) => {
    const numericDraftIndex = Number(draftIndex)
    if (numericDraftIndex === removedIndex) return []
    return [[numericDraftIndex > removedIndex ? numericDraftIndex - 1 : numericDraftIndex, draft]]
  }))
}

function getMovedIndex(index: number, fromIndex: number, toIndex: number) {
  if (index === fromIndex) return toIndex
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1
  return index
}

export function reindexBlockTypeDraftsAfterMove(
  drafts: BlockTypeDraftsByIndex,
  fromIndex: number,
  toIndex: number,
): BlockTypeDraftsByIndex {
  if (fromIndex === toIndex) return drafts

  return Object.fromEntries(Object.entries(drafts).map(([draftIndex, draft]) => {
    const numericDraftIndex = Number(draftIndex)
    return [getMovedIndex(numericDraftIndex, fromIndex, toIndex), draft]
  }))
}
