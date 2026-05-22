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
    'server/api/documents/[id]/download.get.ts': ['eq(document.id, documentId)', 'eq(document.organizationId, orgId)'],
    'server/api/documents/[id]/parse.post.ts': ['eq(document.id, documentId)', 'eq(document.organizationId, orgId)'],
    'server/api/documents/[id]/preview.get.ts': ['eq(document.id, documentId)', 'eq(document.organizationId, orgId)'],
    'server/api/comments/[id].patch.ts': ['eq(comment.id, id)', 'eq(comment.organizationId, orgId)'],
    'server/api/comments/[id].delete.ts': ['eq(comment.id, id)', 'eq(comment.organizationId, orgId)'],
  }

  it('keeps direct resource lookups scoped by active organization', () => {
    for (const [path, snippets] of Object.entries(orgScopedRoutes)) {
      const source = read(path)
      for (const snippet of snippets) {
        expect(source, `${path} missing ${snippet}`).toContain(snippet)
      }
    }
  })

  it('keeps list endpoints scoped by active organization before applying user-controlled filters', () => {
    const scopedListRoutes: Record<string, string> = {
      'server/api/jobs/index.get.ts': 'const conditions = [eq(job.organizationId, orgId)]',
      'server/api/candidates/index.get.ts': 'const conditions = [eq(candidate.organizationId, orgId)]',
      'server/api/applications/index.get.ts': 'const conditions = [eq(application.organizationId, orgId)]',
      'server/api/comments/index.get.ts': 'eq(comment.organizationId, orgId)',
      'server/api/activity-log/index.get.ts': 'const conditions = [eq(activityLog.organizationId, orgId)]',
    }

    for (const [path, snippet] of Object.entries(scopedListRoutes)) {
      expect(read(path), `${path} missing ${snippet}`).toContain(snippet)
    }
  })

  it('ignores body-supplied organizationId on tenant-owned create routes', () => {
    const createRoutes: Record<string, string[]> = {
      'server/api/jobs/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/candidates/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
      'server/api/comments/index.post.ts': ['const orgId = session.session.activeOrganizationId', 'organizationId: orgId'],
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

  it('rolls back public applications when required document upload fails', () => {
    const source = read('server/api/public/jobs/[slug]/apply.post.ts')

    expect(source).toContain('async function rollbackApplicationSubmission')
    expect(source).toContain('application.rollback_s3_cleanup_failed')
    expect(source).toContain('Failed to upload an application document. Please try again.')
    expect(source).toContain('Failed to upload your resume. Please try again.')
    expect(source).not.toContain("don't fail the entire application for a file upload error")
  })
})
