import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

type AxeOptions = {
  include?: string
  exclude?: string[]
}

export async function expectNoA11yViolations(page: Page, options: AxeOptions = {}) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'best-practice'])

  if (options.include) {
    builder = builder.include(options.include)
  }

  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector)
  }

  const results = await builder.analyze()
  const violations = results.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map(node => node.target.join(', ')),
  }))

  expect(violations).toEqual([])
}

export async function expectVisibleKeyboardFocus(locator: Locator) {
  await expect(locator).toBeFocused()

  const hasVisibleIndicator = await locator.evaluate((element) => {
    const styles = window.getComputedStyle(element)
    const outlineWidth = Number.parseFloat(styles.outlineWidth || '0')
    const hasOutline = outlineWidth > 0 && styles.outlineStyle !== 'none' && styles.outlineColor !== 'transparent'
    const hasRing = styles.boxShadow !== 'none'
    const hasBorderChange = styles.borderColor !== 'rgba(0, 0, 0, 0)' && styles.borderColor !== 'transparent'

    return hasOutline || hasRing || hasBorderChange
  })

  expect(hasVisibleIndicator).toBe(true)
}

export async function tabUntilFocused(page: Page, locator: Locator, maxTabs = 8) {
  for (let index = 0; index < maxTabs; index += 1) {
    if (await locator.evaluate(element => element === document.activeElement).catch(() => false)) {
      break
    }
    await page.keyboard.press('Tab')
  }

  await expectVisibleKeyboardFocus(locator)
}
