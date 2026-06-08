import { type Browser, type Page } from '@playwright/test'
import { lookupMembership } from './db'

export type SignUpCredentials = {
  name: string
  email: string
  password: string
}

export type SignUpUserOptions = {
  /** Distinguishes parallel accounts in logs and email local-parts */
  label?: string
  /** When true, completes org creation and returns membership ids */
  withOrg?: boolean
  baseURL?: string
  password?: string
  name?: string
  email?: string
  orgName?: string
}

export type SignUpUserResultBase = SignUpCredentials & {
  page: Page
  close: () => Promise<void>
}

export type SignUpUserResultWithOrg = SignUpUserResultBase & {
  orgName: string
  userId: string
  organizationId: string
}

export type SignUpUserResultWithoutOrg = SignUpUserResultBase & {
  orgName?: undefined
  userId?: undefined
  organizationId?: undefined
}

export type SignUpUserResult = SignUpUserResultWithOrg | SignUpUserResultWithoutOrg

const defaultPassword = () => process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

function buildAccountId(label?: string): string {
  return `${Date.now()}-${label ?? Math.random().toString(36).slice(2)}`
}

export async function signUpOnPage(page: Page, account: SignUpCredentials): Promise<void> {
  await page.goto('/auth/sign-up')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password').fill(account.password)

  await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/api/auth/sign-up') && resp.status() === 200,
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: 'Sign up' }).click(),
  ])

  await page.waitForURL(
    url => url.pathname.includes('/onboarding/') || url.pathname.includes('/auth/sign-in'),
    { waitUntil: 'commit', timeout: 30_000 },
  )

  if (page.url().includes('/auth/sign-in')) {
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)

    await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/auth/sign-in') && resp.status() === 200,
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])

    await page.waitForURL('**/onboarding/**', { waitUntil: 'commit', timeout: 30_000 })
  }
}

export async function createOrganizationOnPage(page: Page, orgName: string): Promise<void> {
  await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByLabel('Organization name').fill(orgName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await page.waitForURL('**/dashboard**', { waitUntil: 'commit' })
}

export async function signUpUser(browser: Browser, options: SignUpUserOptions & { withOrg: true }): Promise<SignUpUserResultWithOrg>
export async function signUpUser(browser: Browser, options?: SignUpUserOptions): Promise<SignUpUserResult>
export async function signUpUser(browser: Browser, options: SignUpUserOptions = {}): Promise<SignUpUserResult> {
  const context = await browser.newContext(options.baseURL ? { baseURL: options.baseURL } : {})
  const page = await context.newPage()
  const id = buildAccountId(options.label)
  const labelPrefix = options.label ? `${options.label}-` : ''
  const account: SignUpCredentials = {
    name: options.name ?? `E2E User ${options.label ?? ''} ${id}`.replace(/\s+/g, ' ').trim(),
    email: options.email ?? `e2e-${labelPrefix}${id}@test.local`,
    password: options.password ?? defaultPassword(),
  }
  const orgName = options.withOrg
    ? (options.orgName ?? `E2E Org ${options.label ?? ''} ${id}`.replace(/\s+/g, ' ').trim())
    : undefined

  await signUpOnPage(page, account)

  if (!options.withOrg) {
    await page.waitForLoadState('networkidle')
    return {
      ...account,
      page,
      close: () => context.close(),
    }
  }

  await createOrganizationOnPage(page, orgName!)
  const membership = await lookupMembership(account.email, orgName!)
  if (!membership.userId || !membership.organizationId) {
    throw new Error(`Failed to resolve membership ids for ${account.email} in ${orgName}`)
  }

  return {
    ...account,
    orgName,
    page,
    userId: membership.userId,
    organizationId: membership.organizationId,
    close: () => context.close(),
  }
}