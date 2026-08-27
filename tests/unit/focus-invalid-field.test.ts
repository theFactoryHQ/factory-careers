import { describe, expect, it } from 'vitest'
import {
  isProgrammaticallyFocusable,
  resolveInvalidFieldFocusTarget,
} from '../../app/utils/focus-invalid-field'

function makeEl(options: {
  tagName?: string
  tabIndex?: number
  attrs?: Record<string, string>
  nested?: HTMLElement | null
}) {
  const attrs = { ...options.attrs }
  const el = {
    tagName: options.tagName ?? 'DIV',
    tabIndex: options.tabIndex ?? -1,
    hasAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(attrs, name)
    },
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name]! : null
    },
    querySelector() {
      return options.nested ?? null
    },
  }
  return el as unknown as HTMLElement
}

describe('focus invalid field targets', () => {
  it('treats native controls and explicit tabindex as programmatically focusable', () => {
    expect(isProgrammaticallyFocusable(makeEl({ tagName: 'BUTTON', tabIndex: 0 }))).toBe(true)
    expect(isProgrammaticallyFocusable(makeEl({ tagName: 'INPUT', tabIndex: 0 }))).toBe(true)
    expect(isProgrammaticallyFocusable(makeEl({
      tagName: 'DIV',
      tabIndex: -1,
      attrs: { tabindex: '-1' },
    }))).toBe(true)
    expect(isProgrammaticallyFocusable(makeEl({ tagName: 'DIV', tabIndex: -1 }))).toBe(false)
  })

  it('focuses the invalid node when it can already take focus', () => {
    const button = makeEl({
      tagName: 'BUTTON',
      tabIndex: 0,
      attrs: { 'aria-invalid': 'true' },
    })
    expect(resolveInvalidFieldFocusTarget({
      querySelector: () => button,
    } as unknown as ParentNode)).toBe(button)
  })

  it('falls back to a nested control when the invalid wrapper cannot take focus', () => {
    const checkbox = makeEl({ tagName: 'INPUT', tabIndex: 0 })
    const group = makeEl({
      tagName: 'DIV',
      tabIndex: -1,
      attrs: { 'aria-invalid': 'true' },
      nested: checkbox,
    })
    expect(resolveInvalidFieldFocusTarget({
      querySelector: () => group,
    } as unknown as ParentNode)).toBe(checkbox)
  })

  it('assigns tabindex=-1 when the invalid node has no nested control', () => {
    const box = makeEl({
      tagName: 'DIV',
      tabIndex: -1,
      attrs: { 'aria-invalid': 'true' },
      nested: null,
    })
    const target = resolveInvalidFieldFocusTarget({
      querySelector: () => box,
    } as unknown as ParentNode)
    expect(target).toBe(box)
    expect(box.tabIndex).toBe(-1)
  })
})
