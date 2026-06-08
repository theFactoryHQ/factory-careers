import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

const toastTargets = [
  'app/pages/onboarding/create-org.vue',
  'app/pages/dashboard/settings/members.vue',
  'app/pages/dashboard/settings/sso.vue',
  'app/pages/dashboard/settings/index.vue',
  'app/pages/dashboard/settings/account.vue',
  'app/pages/dashboard/settings/localization.vue',
  'app/pages/dashboard/settings/integrations.vue',
  'app/pages/dashboard/interviews/[id].vue',
  'app/components/InterviewEmailModal.vue',
  'app/pages/dashboard/emails/templates/[id].vue',
  'app/pages/dashboard/emails/templates/new.vue',
  'app/components/EmailWorkflowSettings.vue',
  'app/pages/dashboard/emails/templates/index.vue',
  'app/pages/dashboard/interviews/index.vue',
  'app/components/InterviewScheduleSidebar.vue',
  'app/pages/dashboard/jobs/[id]/application-form.vue',
  'app/pages/dashboard/jobs/[id]/index.vue',
  'app/components/JobQuestions.vue',
  'app/pages/dashboard/candidates/new.vue',
  'app/pages/dashboard/candidates/[id].vue',
  'app/components/ApplicationLinkModal.vue',
  'app/components/FeedbackModal.vue',
  'app/components/PropertySchemaEditor.vue',
  'app/pages/dashboard/jobs/new.vue',
]

const disallowedInlineActionErrors: Record<string, string[]> = {
  'app/pages/onboarding/create-org.vue': [
    'error.value = err?.message',
    'inviteCodeError.value = err?.data?.statusMessage',
    'searchError.value = err?.data?.statusMessage',
    'requestError.value = err?.data?.statusMessage',
    'v-if="inviteCodeError"',
    'v-if="searchError"',
    'v-if="requestError"',
  ],
  'app/pages/dashboard/settings/members.vue': [
    'inviteError.value = err instanceof Error',
    'invitationsError.value = err instanceof Error ? err.message : \'Failed to cancel invitation\'',
    'createLinkError.value = err?.data?.statusMessage',
    'linksError.value = err?.data?.statusMessage',
    'joinRequestActionError.value = err?.data?.statusMessage',
    'roleUpdateError.value = err instanceof Error',
    'removeError.value = err instanceof Error',
    'v-if="inviteError"',
    'v-if="roleUpdateError"',
    'v-if="joinRequestActionError"',
    'v-if="removeError"',
  ],
  'app/pages/dashboard/settings/sso.vue': [
    'domainSaveError.value = fetchErr.data?.statusMessage',
    'formError.value = fetchErr.data?.statusMessage',
    'v-if="formError"',
    'v-if="domainSaveError"',
  ],
  'app/pages/dashboard/settings/index.vue': [
    'saveError.value = err instanceof Error',
    'deleteError.value = err instanceof Error',
    'v-if="saveError"',
    'v-if="deleteError"',
  ],
  'app/pages/dashboard/settings/account.vue': [
    'profileError.value = err instanceof Error',
    'v-if="profileError"',
  ],
  'app/pages/dashboard/settings/localization.vue': [
    'saveError.value = err instanceof Error',
    'v-if="saveError"',
  ],
  'app/pages/dashboard/settings/integrations.vue': [
    'const errorMessage = ref',
    'errorMessage.value = `Failed to connect',
    'errorMessage.value = `Could not access',
    'errorMessage.value = \'Failed to disconnect',
    'errorMessage.value = \'Failed to update setting',
    'v-if="errorMessage"',
  ],
  'app/pages/dashboard/interviews/[id].vue': [
    'rescheduleError.value = err.data?.statusMessage',
    'editErrors.value.submit = err.data?.statusMessage',
    'sendEmailError.value = err?.data?.statusMessage',
    'v-if="sendEmailError"',
    'v-if="rescheduleError"',
    'v-if="editErrors.submit"',
  ],
  'app/components/InterviewEmailModal.vue': [
    'sendError.value = err?.data?.statusMessage',
    'templateSaveError.value = err?.data?.statusMessage',
    'v-if="sendError"',
    'v-if="templateSaveError"',
  ],
  'app/pages/dashboard/emails/templates/[id].vue': [
    'saveError.value = err?.data?.statusMessage',
    'v-if="saveError"',
  ],
  'app/pages/dashboard/emails/templates/new.vue': [
    'saveError.value = err?.data?.statusMessage',
    'v-if="saveError"',
  ],
  'app/components/EmailWorkflowSettings.vue': [
    'handlePreviewReadOnlyError(err)\n  } finally',
  ],
  'app/pages/dashboard/interviews/index.vue': [
    'editErrors.value.submit = err?.data?.statusMessage',
    'v-if="editErrors.submit"',
  ],
  'app/components/InterviewScheduleSidebar.vue': [
    'errors.value.submit = err?.data?.statusMessage',
    'v-if="errors.submit"',
  ],
  'app/pages/dashboard/jobs/[id]/application-form.vue': [
    'requirementsError.value = err?.data?.statusMessage',
    'complianceError.value = err?.data?.statusMessage',
    'v-if="requirementsError"',
    'v-if="complianceError"',
  ],
  'app/pages/dashboard/jobs/[id]/index.vue': [
    'interviewEditErrors.value.submit = err?.data?.statusMessage',
    'rescheduleError.value = err?.data?.statusMessage',
    'v-if="rescheduleError"',
  ],
  'app/components/JobQuestions.vue': [
    'actionError.value = err.data?.statusMessage',
    'v-if="actionError"',
  ],
  'app/pages/dashboard/candidates/new.vue': [
    'submitError.value = message',
    'v-if="submitError"',
  ],
  'app/pages/dashboard/candidates/[id].vue': [
    'uploadError.value = msg',
    'v-if="uploadError"',
  ],
  'app/components/ApplicationLinkModal.vue': [
    'applyError.value = err.data?.statusMessage',
    'v-if="applyError"',
  ],
  'app/components/FeedbackModal.vue': [
    'submitError.value = err.data?.statusMessage',
  ],
  'app/components/PropertySchemaEditor.vue': [
    'formError.value = message',
  ],
  'app/pages/dashboard/jobs/new.vue': [
    'questionActionError',
  ],
}

describe('action error toast handling', () => {
  it('routes targeted action and mutation failures through the toast system', () => {
    for (const path of toastTargets) {
      const source = readProjectFile(path)

      expect(source, `${path} should initialize toast handling`).toContain('useToast()')
      expect(source, `${path} should surface at least one action error toast`).toContain('toast.error(')

      for (const pattern of disallowedInlineActionErrors[path] ?? []) {
        expect(source, `${path} should not keep inline action error pattern: ${pattern}`).not.toContain(pattern)
      }
    }

    const sidebar = readProjectFile('app/components/CandidateDetailSidebar.vue')
    const documentActions = readProjectFile('app/composables/useApplicationDocumentActions.ts')

    expect(sidebar).toContain('useApplicationDocumentActions')
    expect(sidebar).not.toContain('useToast()')
    expect(documentActions).toContain('useToast()')
    expect(documentActions).toContain('toast.error(')
  })

  it('keeps client-side form validation anchored in the form', () => {
    const onboardingSource = readProjectFile('app/pages/onboarding/create-org.vue')
    const newTemplateSource = readProjectFile('app/pages/dashboard/emails/templates/new.vue')

    expect(onboardingSource).toContain('createOrgValidationError')
    expect(onboardingSource).toContain('v-if="createOrgValidationError"')
    expect(onboardingSource).not.toContain("toast.error('Organization name required')")
    expect(onboardingSource).not.toContain("toast.error('Slug required')")
    expect(onboardingSource).not.toContain("toast.error('Invalid slug'")

    expect(newTemplateSource).toContain('validationError')
    expect(newTemplateSource).toContain('v-if="validationError"')
    expect(newTemplateSource).not.toContain("toast.error('All fields are required')")
  })
})
