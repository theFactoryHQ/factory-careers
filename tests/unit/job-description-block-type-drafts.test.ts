import { describe, expect, it } from 'vitest'
import {
  captureBlockTypeDraft,
  createBlockFromDraft,
  reindexBlockTypeDraftsAfterRemoval,
} from '../../app/utils/jobDescriptionBlockTypeDrafts'

describe('job description block type drafts', () => {
  it('preserves paragraph and bullet drafts while toggling a block type', () => {
    const paragraph = {
      type: 'paragraph',
      body: 'Lead the Factory Cares and Factory Club community pillars.',
    } as const

    let draft = captureBlockTypeDraft({}, paragraph)
    const seededBulletBlock = createBlockFromDraft('bullet_list', draft, paragraph)

    expect(seededBulletBlock).toEqual({
      type: 'bullet_list',
      heading: '',
      items: ['Lead the Factory Cares and Factory Club community pillars.'],
    })

    draft = captureBlockTypeDraft(draft, {
      type: 'bullet_list',
      heading: 'Responsibilities',
      items: ['Build programming calendars', 'Lead community events'],
    })

    expect(createBlockFromDraft('paragraph', draft, seededBulletBlock)).toEqual(paragraph)

    draft = captureBlockTypeDraft(draft, {
      type: 'paragraph',
      body: 'Updated paragraph draft.',
    })

    expect(createBlockFromDraft('bullet_list', draft, paragraph)).toEqual({
      type: 'bullet_list',
      heading: 'Responsibilities',
      items: ['Build programming calendars', 'Lead community events'],
    })
    expect(createBlockFromDraft('paragraph', draft, seededBulletBlock)).toEqual({
      type: 'paragraph',
      body: 'Updated paragraph draft.',
    })
  })

  it('creates a readable paragraph fallback from a bullet section without a paragraph draft', () => {
    expect(createBlockFromDraft('paragraph', {}, {
      type: 'bullet_list',
      heading: 'Factory Cares Responsibilities',
      items: ['Design initiatives', 'Develop programming calendars'],
    })).toEqual({
      type: 'paragraph',
      body: 'Factory Cares Responsibilities\nDesign initiatives\nDevelop programming calendars',
    })
  })

  it('reindexes drafts after a description block is removed', () => {
    expect(reindexBlockTypeDraftsAfterRemoval({
      0: { paragraphBody: 'First' },
      1: { paragraphBody: 'Second' },
      2: { bulletHeading: 'Third', bulletItems: ['Third item'] },
    }, 1)).toEqual({
      0: { paragraphBody: 'First' },
      1: { bulletHeading: 'Third', bulletItems: ['Third item'] },
    })
  })
})
