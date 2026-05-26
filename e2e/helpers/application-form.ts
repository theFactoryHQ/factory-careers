import { expect, type Locator, type Page } from '@playwright/test'

export async function advanceToSubmitButton(page: Page): Promise<Locator> {
  const submitButton = page.getByRole('button', { name: /submit/i })

  for (let step = 0; step < 3; step += 1) {
    if (await submitButton.isVisible()) {
      return submitButton
    }

    const continueButton = page.getByRole('button', { name: 'Continue' }).first()
    await expect(continueButton).toBeVisible({ timeout: 10_000 })
    await expect(continueButton).toBeEnabled()
    await continueButton.click()
  }

  await expect(submitButton).toBeVisible({ timeout: 10_000 })
  return submitButton
}
