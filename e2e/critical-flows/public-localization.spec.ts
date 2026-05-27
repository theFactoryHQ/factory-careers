import { test, expect, selectFactorySelectOption } from '../fixtures'
import { advanceToSubmitButton } from '../helpers/application-form'

type JobResponse = {
  id: string
  slug: string
  status: string
}

test.describe('Public localization flow', () => {
  test('keeps localized public job and application paths working with default fallback', async ({ authenticatedPage, browser }, testInfo) => {
    expect(process.env.FEATURE_FLAG_LANGUAGE_SUPPORT, 'public localization E2E must enable language routes').toBe('true')
    expect(process.env.FACTORY_EMAIL_TEST_MODE, 'localized application submission must use fake mail capture').toBe('capture')

    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const jobTitle = `Localized Candidate Experience ${unique}`
    const applicant = {
      firstName: 'Locale',
      lastName: 'Candidate',
      email: `localized.candidate.${unique}@example.com`,
    }

    await page.goto('/dashboard/settings/localization')
    await expect(page.getByRole('heading', { name: 'Localization' })).toBeVisible({ timeout: 15_000 })

    const [dateFormatResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/org-settings') && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      selectFactorySelectOption(page, 'Date format', 'DD/MM/YYYY - Europe, Vietnam & most regions'),
    ])
    expect(dateFormatResponse.status(), `Date format update returned ${dateFormatResponse.status()}`).toBe(200)
    await expect(page.getByText('24/05/1990', { exact: true })).toBeVisible()

    const createJobResponse = await page.request.post('/api/jobs', {
      data: {
        title: jobTitle,
        description: 'A localized public candidate experience fixture.',
        location: 'Madrid, Spain',
        type: 'full_time',
        salaryMin: 45_000,
        salaryMax: 55_000,
        salaryCurrency: 'EUR',
        salaryUnit: 'YEAR',
        activeFrom: '2026-05-24T12:00:00.000Z',
        requireResume: false,
        requireCoverLetter: false,
        applicationComplianceEnabled: false,
        autoScoreOnApply: false,
      },
    })
    expect(createJobResponse.status(), `Create job API returned ${createJobResponse.status()}`).toBe(201)
    const createdJob = await createJobResponse.json() as JobResponse

    const publishJobResponse = await page.request.patch(`/api/jobs/${createdJob.id}`, {
      data: { status: 'open' },
    })
    expect(publishJobResponse.status(), `Publish job API returned ${publishJobResponse.status()}`).toBe(200)
    const publishedJob = await publishJobResponse.json() as JobResponse
    expect(publishedJob.status).toBe('open')

    const candidateContext = await browser.newContext()
    const candidatePage = await candidateContext.newPage()

    try {
      await candidatePage.goto('/jobs?i18nTest=1')
      await expect(candidatePage.getByTestId('i18n-probe')).toHaveText('Language')
      await expect(candidatePage.getByRole('link', { name: jobTitle })).toBeVisible({ timeout: 15_000 })

      await candidatePage.goto(`/es/jobs/${publishedJob.slug}?i18nTest=1`)
      await expect(candidatePage.getByTestId('i18n-probe')).toHaveText('Idioma')
      await expect(candidatePage.getByRole('heading', { name: jobTitle })).toBeVisible()
      await expect(candidatePage.getByText(new Intl.NumberFormat('es', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(45_000), { exact: false })).toBeVisible()

      await candidatePage.getByRole('link', { name: 'Apply Now' }).first().click()
      await candidatePage.waitForURL(`**/es/jobs/${publishedJob.slug}/apply**`, { waitUntil: 'commit', timeout: 15_000 })
      await candidatePage.waitForLoadState('networkidle')
      await expect(candidatePage.getByRole('heading', { name: jobTitle })).toBeVisible()

      await candidatePage.getByLabel('First name').fill(applicant.firstName)
      await candidatePage.getByLabel('Last name').fill(applicant.lastName)
      await candidatePage.getByLabel('Email').fill(applicant.email)
      await selectFactorySelectOption(candidatePage, /Country/, 'United States')
      await selectFactorySelectOption(candidatePage, /State/, 'California')

      const submitButton = await advanceToSubmitButton(candidatePage)
      const [applyResponse] = await Promise.all([
        candidatePage.waitForResponse(
          resp => resp.url().includes(`/api/public/jobs/${publishedJob.slug}/apply`) && resp.request().method() === 'POST',
          { timeout: 30_000 },
        ),
        submitButton.click(),
      ])
      expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201)

      await candidatePage.waitForURL(`**/es/jobs/${publishedJob.slug}/confirmation`, {
        waitUntil: 'commit',
        timeout: 15_000,
      })
      await expect(candidatePage.getByRole('heading', { name: 'Application submitted' })).toBeVisible()
      await expect(candidatePage.getByRole('link', { name: 'Browse more positions' })).toHaveAttribute('href', '/es/jobs')
    } finally {
      await candidateContext.close()
    }
  })
})
