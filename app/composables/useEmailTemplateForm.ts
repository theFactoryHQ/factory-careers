import type { EmailTemplate } from '~/composables/useEmailTemplates'

export type EmailTemplatePurpose = EmailTemplate['purpose']

export type EmailTemplateFormSource = Pick<EmailTemplate, 'purpose' | 'name' | 'subject' | 'body'>

export const EMAIL_TEMPLATE_PURPOSE_OPTIONS = [
  { value: 'interview_invitation', label: 'Interview Invitation' },
  { value: 'application_acknowledgement', label: 'Application Acknowledgement' },
  { value: 'application_rejection', label: 'Application Rejection' },
] as const satisfies ReadonlyArray<{ value: EmailTemplatePurpose, label: string }>

export const EMAIL_TEMPLATE_SAMPLE_VARIABLES: Record<string, string> = {
  candidateName: 'Alex Johnson',
  candidateFirstName: 'Alex',
  candidateLastName: 'Johnson',
  candidateEmail: 'alex@example.com',
  jobTitle: 'Senior Frontend Engineer',
  interviewTitle: 'Technical Interview — Round 2',
  interviewDate: 'Monday, March 16, 2026',
  interviewTime: '2:00 PM',
  interviewDuration: '60',
  interviewType: 'Video Call',
  interviewLocation: 'https://meet.google.com/abc-defg-hij',
  interviewers: 'Sarah Chen, Michael Park',
  organizationName: 'Acme Corp',
  applicationDate: 'March 16, 2026',
  applicationStatus: 'Rejected',
  dashboardApplicationUrl: 'https://careers.example.com/dashboard/applications/app_123',
}

export function useEmailTemplateForm() {
  const form = reactive({
    purpose: 'interview_invitation' as EmailTemplatePurpose,
    name: '',
    subject: '',
    body: '',
  })

  const showPreview = ref(false)

  const previewSubject = computed(() =>
    renderTemplatePreview(form.subject, EMAIL_TEMPLATE_SAMPLE_VARIABLES),
  )
  const previewBody = computed(() =>
    renderTemplatePreview(form.body, EMAIL_TEMPLATE_SAMPLE_VARIABLES),
  )

  const canSave = computed(() =>
    form.name.trim().length > 0
    && form.subject.trim().length > 0
    && form.body.trim().length > 0,
  )

  function loadFromSource(source: EmailTemplateFormSource) {
    form.purpose = source.purpose
    form.name = source.name
    form.subject = source.subject
    form.body = source.body
  }

  function isDirtyComparedTo(source: EmailTemplateFormSource | null | undefined) {
    if (!source) return false
    return form.purpose !== source.purpose
      || form.name !== source.name
      || form.subject !== source.subject
      || form.body !== source.body
  }

  function trimmedPayload() {
    return {
      purpose: form.purpose,
      name: form.name.trim(),
      subject: form.subject.trim(),
      body: form.body.trim(),
    }
  }

  return {
    form,
    purposeOptions: EMAIL_TEMPLATE_PURPOSE_OPTIONS,
    sampleVariables: EMAIL_TEMPLATE_SAMPLE_VARIABLES,
    showPreview,
    previewSubject,
    previewBody,
    canSave,
    loadFromSource,
    isDirtyComparedTo,
    trimmedPayload,
  }
}