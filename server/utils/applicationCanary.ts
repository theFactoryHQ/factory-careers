type CanaryQuestion = {
  id: string
  type: string
  required: boolean
  options?: string[] | null
}

type CanaryFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function validateApplicationCanaryIdentity(input: {
  slug: string
  configuredSlug: string
  email: string
}): boolean {
  return input.slug === input.configuredSlug
    && /^factory-careers-canary\+[a-z0-9-]+@example\.com$/i.test(input.email)
}

export function buildCanaryQuestionResponses(questions: CanaryQuestion[]): Array<{
  questionId: string
  value: string | string[] | number | boolean
}> {
  return questions.filter(question => question.required && question.type !== 'file_upload').map((question) => {
    if (['select', 'radio'].includes(question.type)) {
      const firstOption = question.options?.[0]
      if (!firstOption) throw new Error(`Required canary question ${question.id} has no option`)
      return { questionId: question.id, value: firstOption }
    }
    if (['multi_select', 'checkbox'].includes(question.type)) {
      const firstOption = question.options?.[0]
      if (!firstOption) throw new Error(`Required canary question ${question.id} has no option`)
      return { questionId: question.id, value: [firstOption] }
    }
    if (question.type === 'number') return { questionId: question.id, value: 1 }
    if (question.type === 'boolean') return { questionId: question.id, value: true }
    return { questionId: question.id, value: 'Factory Careers synthetic application canary' }
  })
}

function canaryPdf(): Blob {
  const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
  return new Blob([pdf], { type: 'application/pdf' })
}

export async function executeApplicationCanary(input: {
  baseUrl: string
  slug: string
  secret: string
  email: string
  fetchFn?: CanaryFetch
}): Promise<{ ok: true, code: 'application_canary_passed' }> {
  const fetchFn = input.fetchFn ?? fetch
  const baseUrl = input.baseUrl.replace(/\/$/, '')
  const jobResponse = await fetchFn(`${baseUrl}/api/public/jobs/${encodeURIComponent(input.slug)}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!jobResponse.ok) throw new Error('application_canary_job_unavailable')
  const job = await jobResponse.json() as { requireResume?: boolean, questions?: CanaryQuestion[] }
  const questions = job.questions ?? []
  const form = new FormData()
  form.set('firstName', 'Synthetic')
  form.set('lastName', 'Canary')
  form.set('email', input.email)
  form.set('country', 'United States')
  form.set('state', 'NY')
  form.set('responses', JSON.stringify(buildCanaryQuestionResponses(questions)))
  if (job.requireResume) form.set('resume', canaryPdf(), 'factory-careers-canary.pdf')
  for (const question of questions.filter(question => question.required && question.type === 'file_upload')) {
    form.set(`file:${question.id}`, canaryPdf(), 'factory-careers-canary.pdf')
  }

  const response = await fetchFn(`${baseUrl}/api/public/jobs/${encodeURIComponent(input.slug)}/apply`, {
    method: 'POST',
    headers: {
      'x-cron-secret': input.secret,
      'x-factory-canary': '1',
    },
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => ({})) as { ok?: boolean, code?: string }
  if (!response.ok || body.ok !== true || body.code !== 'application_canary_passed') {
    throw new Error('application_canary_submission_failed')
  }
  return { ok: true, code: 'application_canary_passed' }
}
