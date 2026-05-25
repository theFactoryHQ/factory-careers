import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : []
  })
}

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

function normalize(path: string): string {
  return path.split('\\').join('/')
}

describe('API route security coverage', () => {
  const intentionallyPublicRoutes = new Set([
    'server/api/auth/[...all].ts',
    'server/api/auth/providers.get.ts',
    'server/api/calendar/webhook.post.ts',
    'server/api/healthz.get.ts',
    'server/api/readyz.get.ts',
    'server/api/invite-links/info/[token].get.ts',
    'server/api/public/interviews/respond.get.ts',
    'server/api/public/interviews/respond.post.ts',
    'server/api/public/jobs/[slug].get.ts',
    'server/api/public/jobs/[slug]/apply.post.ts',
    'server/api/public/jobs/index.get.ts',
    'server/api/public/track/[code].get.ts',
    'server/routes/ingest/[...path].ts',
  ])

  it('requires every non-public API route to contain an auth/session gate', () => {
    const routeFiles = [
      ...walk(join(root, 'server/api')),
      ...walk(join(root, 'server/routes')),
    ].map((path) => normalize(relative(root, path)))

    const missingGuards = routeFiles.filter((path) => {
      if (intentionallyPublicRoutes.has(path)) return false
      const source = read(path)
      return !/(requireAuth|requirePermission|requireChatbotAccess)\s*\(|auth\.api\.getSession\s*\(/.test(source)
    })

    expect(missingGuards).toEqual([])
  })

  it('does not allow routes to call requirePermission with an empty permission object', () => {
    const routeFiles = walk(join(root, 'server/api')).map((path) => normalize(relative(root, path)))
    const unsafeCalls = routeFiles.filter((path) =>
      /requirePermission\s*\(\s*event\s*,\s*\{\s*\}\s*\)/.test(read(path)),
    )

    expect(unsafeCalls).toEqual([])
  })

  it('keeps CLI authentication on device authorization and bearer tokens', () => {
    const authSource = read('server/utils/auth.ts')
    const clientSource = read('app/utils/auth-client.ts')
    const devicePageSource = read('app/pages/device.vue')
    const envSource = read('server/utils/env.ts')

    expect(authSource).toContain('deviceAuthorization({')
    expect(authSource).toContain('schema: {')
    expect(authSource).toContain('bearer()')
    expect(authSource).toContain('validateFactoryCareersCliClient')
    expect(authSource).toContain('FACTORY_CAREERS_CLI_CLIENT_ID')
    expect(clientSource).toContain('deviceAuthorizationClient()')
    expect(devicePageSource).toContain('authClient.device')
    expect(devicePageSource).toContain('authClient.device.approve')
    expect(devicePageSource).toContain('authClient.device.deny')
    expect(envSource).toContain('FACTORY_CAREERS_CLI_CLIENT_ID')
  })

  it('keeps device authorization persistence covered by schema and migration', () => {
    const schemaSource = read('server/database/schema/auth.ts')
    const migrationSource = read('server/database/migrations/0035_device_authorization.sql')
    const journalSource = read('server/database/migrations/meta/_journal.json')

    for (const snippet of [
      'export const deviceCode',
      'device_code',
      'deviceCode',
      'userCode',
      'clientId',
      'pollingInterval',
    ]) {
      expect(schemaSource, `schema missing ${snippet}`).toContain(snippet)
    }

    expect(migrationSource).toContain('CREATE TABLE "device_code"')
    expect(migrationSource).toContain('"device_code" text NOT NULL')
    expect(migrationSource).toContain('"user_code" text NOT NULL')
    expect(journalSource).toContain('0035_device_authorization')
  })
})

describe('P0 tenant-isolation route coverage', () => {
  const orgScopedRoutes: Record<string, string[]> = {
    'server/api/jobs/[id].get.ts': ['eq(job.id, id)', 'eq(job.organizationId, orgId)'],
    'server/api/jobs/[id].patch.ts': ['eq(job.id, id)', 'eq(job.organizationId, orgId)'],
    'server/api/jobs/[id].delete.ts': ['eq(job.id, id)', 'eq(job.organizationId, orgId)'],
    'server/api/candidates/[id].get.ts': ['eq(candidate.id, id)', 'eq(candidate.organizationId, orgId)'],
    'server/api/candidates/[id].patch.ts': ['eq(candidate.id, id)', 'eq(candidate.organizationId, orgId)'],
    'server/api/candidates/[id].delete.ts': ['eq(candidate.id, id)', 'eq(candidate.organizationId, orgId)'],
    'server/api/applications/[id].get.ts': ['eq(application.id, id)', 'eq(application.organizationId, orgId)'],
    'server/api/applications/[id].patch.ts': ['eq(application.id, id)', 'eq(application.organizationId, orgId)'],
    'server/api/applications/[id]/analyze.post.ts': ['eq(application.id, applicationId)', 'eq(application.organizationId, orgId)'],
    'server/api/applications/[id]/scores.get.ts': ['eq(application.id, applicationId)', 'eq(application.organizationId, orgId)'],
    'server/api/documents/[id].delete.ts': ['eq(document.id, documentId)', 'eq(document.organizationId, orgId)'],
    'server/api/documents/[id]/parse.post.ts': ['eq(document.id, documentId)', 'eq(document.organizationId, orgId)'],
    'server/api/documents/parse-all.post.ts': ['eq(document.id, doc.id)', 'eq(document.organizationId, orgId)'],
    'server/api/comments/[id].patch.ts': ['eq(comment.id, id)', 'eq(comment.organizationId, orgId)'],
    'server/api/comments/[id].delete.ts': ['eq(comment.id, id)', 'eq(comment.organizationId, orgId)'],
    'server/api/interviews/[id]/index.get.ts': ['eq(interview.id, id)', 'eq(interview.organizationId, orgId)'],
    'server/api/interviews/[id]/index.patch.ts': ['eq(interview.id, id)', 'eq(interview.organizationId, orgId)'],
    'server/api/interviews/[id]/index.delete.ts': ['eq(interview.id, id)', 'eq(interview.organizationId, orgId)'],
    'server/api/interviews/[id]/send-invitation.post.ts': ['eq(interview.id, id)', 'eq(interview.organizationId, orgId)'],
    'server/api/tracking-links/[id].get.ts': ['eq(trackingLink.id, id)', 'eq(trackingLink.organizationId, orgId)'],
    'server/api/tracking-links/[id].patch.ts': ['eq(trackingLink.id, id)', 'eq(trackingLink.organizationId, orgId)'],
    'server/api/tracking-links/[id].delete.ts': ['eq(trackingLink.id, id)', 'eq(trackingLink.organizationId, orgId)'],
    'server/api/tracking-links/[id]/stats.get.ts': ['eq(trackingLink.id, id)', 'eq(trackingLink.organizationId, orgId)'],
    'server/api/email-templates/[id]/index.patch.ts': ['eq(emailTemplate.id, id)', 'eq(emailTemplate.organizationId, orgId)'],
    'server/api/email-templates/[id]/index.delete.ts': ['eq(emailTemplate.id, id)', 'eq(emailTemplate.organizationId, orgId)'],
    'server/api/properties/[id].patch.ts': ['eq(propertyDefinition.id, id)', 'eq(propertyDefinition.organizationId, orgId)'],
    'server/api/properties/[id].delete.ts': ['eq(propertyDefinition.id, id)', 'eq(propertyDefinition.organizationId, orgId)'],
    'server/api/ai-config/[id].get.ts': ['eq(aiConfig.id, id)', 'eq(aiConfig.organizationId, orgId)'],
    'server/api/ai-config/[id].patch.ts': ['eq(aiConfig.id, id)', 'eq(aiConfig.organizationId, orgId)'],
    'server/api/ai-config/[id].delete.ts': ['eq(aiConfig.id, id)', 'eq(aiConfig.organizationId, orgId)'],
    'server/api/ai-config/[id]/set-default.post.ts': ['eq(aiConfig.id, id)', 'eq(aiConfig.organizationId, orgId)'],
    'server/api/ai-config/[id]/test-connection.post.ts': ['eq(aiConfig.id, id)', 'eq(aiConfig.organizationId, orgId)'],
    'server/api/invite-links/[id].delete.ts': ['eq(inviteLink.id, linkId)', 'eq(inviteLink.organizationId, orgId)'],
    'server/api/join-requests/[id]/approve.post.ts': ['eq(joinRequest.id, requestId)', 'eq(joinRequest.organizationId, orgId)'],
    'server/api/join-requests/[id]/reject.post.ts': ['eq(joinRequest.id, requestId)', 'eq(joinRequest.organizationId, orgId)'],
    'server/api/sso/providers/[id].delete.ts': ['eq(ssoProvider.id, id)', 'eq(ssoProvider.organizationId, orgId)'],
  }

  it('keeps direct resource lookups scoped by active organization', () => {
    for (const [path, snippets] of Object.entries(orgScopedRoutes)) {
      const source = read(path)
      for (const snippet of snippets) {
        expect(source, `${path} missing ${snippet}`).toContain(snippet)
      }
    }
  })

  it('keeps shared document stream lookups scoped by active organization', () => {
    const helperSource = read('server/utils/documentStreaming.ts')
    expect(helperSource).toContain('eq(document.id, documentId)')
    expect(helperSource).toContain('eq(document.organizationId, orgId)')

    for (const route of [
      'server/api/documents/[id]/download.get.ts',
      'server/api/documents/[id]/preview.get.ts',
    ]) {
      const source = read(route)
      expect(source, `${route} missing shared document lookup`).toContain('loadOrgDocumentForRead(orgId, documentId)')
      expect(source, `${route} missing document read permission`).toContain("requirePermission(event, { document: ['read'] })")
    }
  })

  it('keeps list endpoints scoped by active organization before applying user-controlled filters', () => {
    const scopedListRoutes: Record<string, string> = {
      'server/api/jobs/index.get.ts': 'const conditions = [eq(job.organizationId, orgId)]',
      'server/api/candidates/index.get.ts': 'const conditions = [eq(candidate.organizationId, orgId)]',
      'server/api/applications/index.get.ts': 'const conditions = [eq(application.organizationId, orgId)]',
      'server/api/comments/index.get.ts': 'eq(comment.organizationId, orgId)',
      'server/api/activity-log/index.get.ts': 'const conditions = [eq(activityLog.organizationId, orgId)]',
      'server/api/interviews/index.get.ts': 'const conditions = [eq(interview.organizationId, orgId)]',
      'server/api/tracking-links/index.get.ts': 'const conditions = [eq(trackingLink.organizationId, orgId)]',
      'server/api/email-templates/index.get.ts': 'where: eq(emailTemplate.organizationId, orgId)',
      'server/api/properties/index.get.ts': 'organizationId: orgId',
      'server/api/org-settings/index.get.ts': 'where: eq(orgSettings.organizationId, orgId)',
      'server/api/ai-config/index.get.ts': 'where: eq(aiConfig.organizationId, orgId)',
      'server/api/invite-links/index.get.ts': 'eq(inviteLink.organizationId, orgId)',
      'server/api/join-requests/index.get.ts': 'eq(joinRequest.organizationId, orgId)',
      'server/api/sso/providers.get.ts': 'where(eq(ssoProvider.organizationId, orgId))',
    }

    for (const [path, snippet] of Object.entries(scopedListRoutes)) {
      expect(read(path), `${path} missing ${snippet}`).toContain(snippet)
    }
  })

  it('ignores body-supplied organizationId on tenant-owned create routes', () => {
    const createRoutes: Record<string, string[]> = {
      'server/api/jobs/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/candidates/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/applications/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/comments/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/interviews/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/tracking-links/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/email-templates/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/properties/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/ai-config/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/invite-links/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
    }

    for (const [path, snippets] of Object.entries(createRoutes)) {
      const source = read(path)
      expect(source, `${path} must not read body.organizationId`).not.toContain('body.organizationId')
      for (const snippet of snippets) {
        expect(source, `${path} missing ${snippet}`).toContain(snippet)
      }
    }
  })

  it('verifies comments can only target resources in the active organization', () => {
    const source = read('server/api/comments/index.post.ts')

    expect(source).toContain('eq(candidate.organizationId, orgId)')
    expect(source).toContain('eq(application.organizationId, orgId)')
    expect(source).toContain('eq(job.organizationId, orgId)')
  })

  it('cleans up candidate-owned document objects when deleting a candidate', () => {
    const source = read('server/api/candidates/[id].delete.ts')

    expect(source).toContain('db.query.document.findMany')
    expect(source).toContain('eq(document.candidateId, id)')
    expect(source).toContain('eq(document.organizationId, orgId)')
    expect(source).toContain('deleteFromS3(doc.storageKey)')
    expect(source).toContain('candidate.document_s3_delete_failed')
  })

  it('cleans up organization-owned document objects when deleting an organization', () => {
    const source = read('server/utils/auth.ts')

    expect(source).toContain('beforeDeleteOrganization')
    expect(source).toContain('afterDeleteOrganization')
    expect(source).toContain('pendingOrganizationDocumentDeletes')
    expect(source).toContain('ORGANIZATION_DOCUMENT_DELETE_TTL_MS')
    expect(source).toContain('clearPendingOrganizationDocumentDelete')
    expect(source).toContain('db.query.document.findMany')
    expect(source).toContain('eq(schema.document.organizationId, organization.id)')
    expect(source).toContain('deleteFromS3(doc.storageKey)')
    expect(source).toContain('organization.document_s3_delete_failed')
  })

  it('records audit activity for production-sensitive admin and source tracking changes', () => {
    const routes: Record<string, string[]> = {
      'server/api/sso/providers.post.ts': ['recordActivity({', "resourceType: 'ssoProvider'", "action: 'created'"],
      'server/api/sso/providers/[id].delete.ts': ['recordActivity({', "resourceType: 'ssoProvider'", "action: 'deleted'"],
      'server/api/tracking-links/index.post.ts': ['recordActivity({', "resourceType: 'trackingLink'", "action: 'created'"],
      'server/api/tracking-links/[id].patch.ts': ['recordActivity({', "resourceType: 'trackingLink'", "action: 'updated'"],
      'server/api/tracking-links/[id].delete.ts': ['recordActivity({', "resourceType: 'trackingLink'", "action: 'deleted'"],
    }

    for (const [path, snippets] of Object.entries(routes)) {
      const source = read(path)
      for (const snippet of snippets) {
        expect(source, `${path} missing ${snippet}`).toContain(snippet)
      }
    }
  })

  it('does not let CI flags bypass rate limiting in production', () => {
    const sources = [
      read('server/middleware/api-rate-limit.ts'),
      read('server/api/public/jobs/[slug]/apply.post.ts'),
      read('server/utils/auth.ts'),
    ]

    expect(sources[0]).toContain("process.env.NODE_ENV !== 'production'")
    expect(sources[1]).toContain("process.env.NODE_ENV === 'production'")
    expect(sources[2]).toContain('enabled: process.env.NODE_ENV === "production"')

    for (const source of sources) {
      expect(source).not.toContain('process.env.CI')
      expect(source).not.toContain('process.env.GITHUB_ACTIONS')
    }
  })

  it('requires HTTPS SSO issuer URLs in production', () => {
    const routeSource = read('server/api/sso/providers.post.ts')
    const securitySource = read('server/utils/ssoSecurity.ts')

    expect(routeSource).toContain('discoverOidcRegistrationConfig(body.issuer')
    expect(routeSource).toContain("allowLocalHttp: process.env.NODE_ENV !== 'production'")
    expect(securitySource).toContain("allowedProtocols: allowLocalHttp ? ['https:', 'http:'] : ['https:']")
    expect(securitySource).toContain('isLocalhostUrl(value)')
    expect(securitySource).toContain('Issuer URL must use HTTPS')
    expect(securitySource).toContain('assertSafeServerSideUrl')
  })

  it('validates discovered SSO endpoints with DNS checks and blocks redirects', () => {
    const securitySource = read('server/utils/ssoSecurity.ts')

    expect(securitySource).toContain('async function validateDiscoveryEndpoint')
    expect(securitySource).toContain('await assertSafeServerSideUrl(value')
    expect(securitySource).toContain("redirect: 'error'")
  })

  it('uses the dedicated AI config read permission for config-management reads', () => {
    const guardedRoutes = [
      'server/api/ai-config/index.get.ts',
      'server/api/ai-config/[id].get.ts',
      'server/api/ai-config/providers.get.ts',
    ]

    for (const path of guardedRoutes) {
      expect(read(path), `${path} must require aiConfig:read`).toContain("requirePermission(event, { aiConfig: ['read'] })")
    }
  })

  it('performs DNS-backed custom AI base URL validation before direct chatbot model use', () => {
    const source = read('server/api/chatbot/chat.post.ts')
    const assertionIndex = source.indexOf('await assertSafeServerSideUrl(config.baseUrl)')
    const modelIndex = source.indexOf('const model = createLanguageModel')

    expect(source).toContain("from '../../utils/serverSideUrl'")
    expect(assertionIndex).toBeGreaterThanOrEqual(0)
    expect(modelIndex).toBeGreaterThan(assertionIndex)
  })

  it('uses byte-safe OAuth state comparison for Microsoft calendar callbacks', () => {
    const source = read('server/api/calendar/microsoft/callback.get.ts')

    expect(source).toContain("from '../../../utils/secureCompare'")
    expect(source).toContain('timingSafeStringEqual(storedState, state)')
    expect(source).not.toContain('timingSafeEqual(')
    expect(source).not.toContain('storedState.length !== state.length')
  })

  it('rolls back public applications when required document upload fails', () => {
    const source = read('server/api/public/jobs/[slug]/apply.post.ts')

    expect(source).toContain('async function rollbackApplicationSubmission')
    expect(source).toContain('application.rollback_s3_cleanup_failed')
    expect(source).toContain('Failed to upload an application document. Please try again.')
    expect(source).toContain('Failed to upload your resume. Please try again.')
    expect(source).not.toContain("don't fail the entire application for a file upload error")
  })

  it('keeps organization search authenticated while allowing users without an active organization', () => {
    const source = read('server/api/org-search/index.get.ts')

    expect(source).toContain('auth.api.getSession({ headers: event.headers })')
    expect(source).not.toContain('requireAuth(event)')
    expect(source).not.toContain('requirePermission(event')
    expect(source).toContain('id: organization.id')
    expect(source).toContain('name: organization.name')
    expect(source).toContain('slug: organization.slug')
    expect(source).toContain('.limit(5)')
  })

  it('keeps join-request creation authenticated while allowing users without an active organization', () => {
    const source = read('server/api/join-requests/index.post.ts')

    expect(source).toContain('auth.api.getSession({ headers: event.headers })')
    expect(source).not.toContain('requireAuth(event)')
    expect(source).not.toContain('requirePermission(event')
    expect(source).toContain('eq(organization.id, body.organizationId)')
    expect(source).toContain('eq(member.userId, session.user.id)')
    expect(source).toContain('eq(joinRequest.userId, session.user.id)')
    expect(source).toContain("eq(joinRequest.status, 'pending')")
  })

  it('keeps invite-link info public and invite-link acceptance authenticated without active-org requirements', () => {
    const infoSource = read('server/api/invite-links/info/[token].get.ts')
    const acceptSource = read('server/api/invite-links/accept.post.ts')

    expect(infoSource).not.toContain('requireAuth(event)')
    expect(infoSource).not.toContain('requirePermission(event')
    expect(infoSource).not.toContain('auth.api.getSession')
    expect(infoSource).toContain('organizationName')
    expect(infoSource).toContain('organizationSlug')
    expect(infoSource).toContain('invitedByName')
    expect(infoSource).not.toContain('token: inviteLink.token')
    expect(infoSource).not.toContain('token: link')

    expect(acceptSource).toContain('auth.api.getSession({ headers: event.headers })')
    expect(acceptSource).not.toContain('requireAuth(event)')
    expect(acceptSource).not.toContain('requirePermission(event')
    expect(acceptSource).toContain('eq(inviteLink.token, body.token)')
    expect(acceptSource).toContain('onConflictDoNothing({ target: [member.userId, member.organizationId] })')
  })
})
