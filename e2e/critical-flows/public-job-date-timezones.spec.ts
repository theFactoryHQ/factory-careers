import { expect, test } from '../fixtures'
import { createJob, publishJob } from '../helpers/recruiting-fixtures'

test('public date-only fields remain stable across UTC, Pacific, and Eastern browsers', async ({
  authenticatedPage,
  browser,
}) => {
  const title = `Timezone-safe accountant ${Date.now()}`
  const created = await createJob(authenticatedPage.request, title, {
    activeFrom: '2026-06-14',
  })
  const published = await publishJob(authenticatedPage.request, created.id)
  expect(published.slug).toBeTruthy()

  for (const timezoneId of ['UTC', 'America/Los_Angeles', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId })
    const page = await context.newPage()
    const hydrationErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|mismatch/i.test(message.text())) {
        hydrationErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      if (/hydration|mismatch/i.test(error.message)) hydrationErrors.push(error.message)
    })

    await page.goto(`/jobs/${published.slug}`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText('Jun 14, 2026', { exact: true })).toBeVisible()
    expect(hydrationErrors, `${timezoneId} hydration errors`).toEqual([])
    await context.close()
  }
})
