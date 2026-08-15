import { test, expect } from '../fixtures'
import { createJob, publishJob, expectApiStatus } from '../helpers/recruiting-fixtures'

test.describe('Public application persistence', () => {
  test('stores an application when browser autofill populates the legacy honeypot field', async ({ authenticatedPage }, testInfo) => {
    const unique = `${Date.now()}-r${testInfo.retry}`
    const job = await createJob(
      authenticatedPage.request,
      `Autofill persistence regression ${unique}`,
    )
    const publishedJob = await publishJob(authenticatedPage.request, job.id)
    const applicantEmail = `autofill.persistence.${unique}@example.com`

    const applyResponse = await authenticatedPage.request.post(
      `/api/public/jobs/${publishedJob.slug}/apply`,
      {
        data: {
          firstName: 'Autofill',
          lastName: 'Regression',
          email: applicantEmail,
          country: 'United States',
          state: 'NY',
          responses: [],
          website: 'https://autofill.example.test',
        },
      },
    )

    await expectApiStatus(applyResponse, 201, 'Public apply API')

    const applicationsResponse = await authenticatedPage.request.get(
      `/api/applications?jobId=${job.id}&limit=10`,
    )
    await expectApiStatus(applicationsResponse, 200, 'Applications API')
    const applications = await applicationsResponse.json() as {
      data: Array<{ candidateEmail: string }>
    }

    expect(applications.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateEmail: applicantEmail }),
      ]),
    )
  })
})
