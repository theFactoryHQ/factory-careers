import { expect, test } from '../fixtures'

const publicDropdownRoutes = [
  '/privacy/delete-request',
]

test.describe('global dropdown styling', () => {
  for (const route of publicDropdownRoutes) {
    test(`keeps visible native selects styled or replaced on ${route}`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const unstyledNativeSelects = await page.locator('select').evaluateAll((selects) =>
        selects
          .filter((select) => {
            const element = select as HTMLSelectElement
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          })
          .filter(select => !select.classList.contains('factory-filter-select') && !select.classList.contains('ui-field'))
          .map(select => select.id || select.getAttribute('name') || select.outerHTML.slice(0, 80)),
      )

      expect(unstyledNativeSelects).toEqual([])
    })
  }

  test('renders the privacy state selector as a styled Factory dropdown', async ({ page }) => {
    await page.goto('/privacy/delete-request')
    await page.waitForLoadState('networkidle')

    const stateDropdown = page.getByRole('button', { name: 'State of residence' })
    await expect(stateDropdown).toBeVisible()

    const triggerStyles = await stateDropdown.evaluate((element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
        height: rect.height,
      }
    })

    expect(triggerStyles.height).toBeGreaterThanOrEqual(44)
    expect(triggerStyles.backgroundColor).not.toBe('rgb(255, 255, 255)')
    expect(triggerStyles.borderColor).not.toBe('rgb(118, 118, 118)')
    expect(triggerStyles.color).toBe('rgb(255, 255, 255)')

    await stateDropdown.click()

    const stateListbox = page.getByRole('listbox')
    await expect(stateListbox).toBeVisible()
    await expect(page.getByRole('option', { name: 'California' })).toBeVisible()

    const listboxStyles = await stateListbox.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      }
    })

    expect(listboxStyles.backgroundColor).not.toBe('rgb(255, 255, 255)')
    expect(listboxStyles.borderColor).not.toBe('rgb(118, 118, 118)')
  })
})
