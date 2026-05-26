import { test, expect } from '../fixtures'

const TEMPLATE_NAME = 'Interview Template E2E'

test.describe('Interview email templates', () => {
  test('keeps built-in templates read-only and manages a custom template lifecycle', async ({ authenticatedPage }, testInfo) => {
    const page = authenticatedPage
    const unique = `${Date.now()}-r${testInfo.retry}`
    const templateName = `${TEMPLATE_NAME} ${unique}`
    const updatedTemplateName = `${templateName} Updated`

    await page.goto('/dashboard/interviews/templates', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Email Templates' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Standard Interview Invitation/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Technical Interview/ })).toBeVisible()

    await page.goto('/dashboard/interviews/templates/system-standard', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Standard Interview Invitation' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Template Name')).toBeDisabled()
    await expect(page.getByLabel('Subject Line')).toBeDisabled()
    await expect(page.getByLabel('Email Body')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Duplicate as Custom' })).toBeVisible()
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByText('Interview Invitation: Senior Frontend Engineer at Acme Corp')).toBeVisible()
    await expect(page.getByText(/Dear Alex Johnson,/)).toBeVisible()

    await page.goto('/dashboard/interviews/templates/new', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Create Template' })).toBeDisabled()

    await page.getByLabel('Template Name').fill(templateName)
    await page.getByLabel('Subject Line').fill('Interview for {{jobTitle}} with {{organizationName}}')
    await page.getByLabel('Email Body').fill('Hi {{candidateFirstName}}, your {{interviewTitle}} is at {{interviewTime}}.')
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByText('Interview for Senior Frontend Engineer with Acme Corp')).toBeVisible()
    await expect(page.getByText('Hi Alex, your Technical Interview')).toBeVisible()

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/email-templates') && resp.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Create Template' }).click(),
    ])
    expect(createResponse.status(), `Create template API returned ${createResponse.status()}`).toBe(201)
    const createdTemplate = await createResponse.json() as { id: string }
    expect(createdTemplate.id, 'created template id must be present').toBeTruthy()

    await page.waitForURL(`**/dashboard/interviews/templates/${createdTemplate.id}`, { waitUntil: 'commit', timeout: 15_000 })
    await expect(page.getByRole('heading', { name: templateName })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Template Name')).toHaveValue(templateName)

    await page.getByLabel('Template Name').fill(updatedTemplateName)
    await page.getByLabel('Subject Line').fill('Updated interview for {{candidateName}}')
    await page.getByLabel('Email Body').fill('Hello {{candidateName}}, meet {{interviewers}} for {{jobTitle}}.')
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeEnabled()

    const [updateResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/email-templates/${createdTemplate.id}`) && resp.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ])
    expect(updateResponse.status(), `Update template API returned ${updateResponse.status()}`).toBe(200)

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: updatedTemplateName })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Subject Line')).toHaveValue('Updated interview for {{candidateName}}')
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByText('Updated interview for Alex Johnson')).toBeVisible()
    await expect(page.getByText('Hello Alex Johnson, meet Sarah Chen, Michael Park')).toBeVisible()

    await page.goto('/dashboard/interviews/templates', { waitUntil: 'networkidle' })
    await expect(page.getByRole('link', { name: new RegExp(updatedTemplateName) })).toBeVisible({ timeout: 15_000 })

    await page.goto(`/dashboard/interviews/templates/${createdTemplate.id}`, { waitUntil: 'networkidle' })
    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes(`/api/email-templates/${createdTemplate.id}`) && resp.request().method() === 'DELETE',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Delete Template' }).click(),
    ])
    expect(deleteResponse.status(), `Delete template API returned ${deleteResponse.status()}`).toBe(204)
    await page.waitForURL('**/dashboard/interviews/templates', { waitUntil: 'commit', timeout: 15_000 })
    await expect(page.getByText(updatedTemplateName)).toHaveCount(0)
  })
})
