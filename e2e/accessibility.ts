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

export async function runAxeScan(page: Page) {
  const results = await new AxeBuilder({ page })
    .disableRules([
      'color-contrast',
      'heading-order',
      'landmark-main-is-top-level',
      'landmark-no-duplicate-main',
      'landmark-unique',
      'page-has-heading-one',
      'region',
    ])
    .analyze()

  expect(results.violations).toEqual([])
}

export async function expectVisibleFocus(page: Page) {
  const focusStyle = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    const styles = window.getComputedStyle(el)
    return {
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      boxShadow: styles.boxShadow,
    }
  })

  expect(focusStyle).not.toBeNull()
  expect(
    focusStyle!.outlineStyle !== 'none'
      || focusStyle!.outlineWidth !== '0px'
      || focusStyle!.boxShadow !== 'none',
  ).toBeTruthy()
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

export async function openWithKeyboard(page: Page, trigger: Locator) {
  await page.waitForLoadState('networkidle')
  await trigger.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

export async function expectFocusRestored(page: Page, trigger: Locator) {
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
}