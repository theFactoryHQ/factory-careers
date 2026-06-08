import { type Browser, type BrowserContext, type Page } from '@playwright/test'

export type GuestContextOptions = {
  baseURL?: string
}

export type GuestPageHandle = {
  page: Page
  context: BrowserContext
  close: () => Promise<void>
}

export async function createGuestPage(
  browser: Browser,
  options: GuestContextOptions = {},
): Promise<GuestPageHandle> {
  const context = await browser.newContext(options.baseURL ? { baseURL: options.baseURL } : {})
  const page = await context.newPage()

  return {
    page,
    context,
    close: () => context.close(),
  }
}

export async function withGuestContext<T>(
  browser: Browser,
  fn: (page: Page) => Promise<T>,
  options: GuestContextOptions = {},
): Promise<T> {
  const guest = await createGuestPage(browser, options)

  try {
    return await fn(guest.page)
  }
  finally {
    await guest.close()
  }
}