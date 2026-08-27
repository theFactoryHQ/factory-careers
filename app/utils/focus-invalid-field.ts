const nestedFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(',')

export function isProgrammaticallyFocusable(el: HTMLElement) {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false
  if (el.hasAttribute('tabindex')) return el.tabIndex >= -1
  return el.tabIndex >= 0
}

export function resolveInvalidFieldFocusTarget(root: ParentNode): HTMLElement | null {
  const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!invalid) return null
  if (isProgrammaticallyFocusable(invalid)) return invalid

  const nested = invalid.querySelector<HTMLElement>(nestedFocusableSelector)
  if (nested) return nested

  invalid.tabIndex = -1
  return invalid
}

export function focusFirstInvalidField(root: ParentNode | null | undefined) {
  if (!root || typeof document === 'undefined') return
  const target = resolveInvalidFieldFocusTarget(root)
  if (!target) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
