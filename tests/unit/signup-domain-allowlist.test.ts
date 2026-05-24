import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { signupAllowedDomainsSchema } from '../../server/utils/schemas/orgSettings'
import {
  extractSignupEmailDomain,
  hasPostgresErrorCode,
  normalizeSignupAllowedDomains,
  isSignupEmailDomainAllowed,
} from '../../server/utils/signupDomainAllowlist'
import {
  isCommonConsumerEmailDomain,
  SIGNUP_ALLOWED_DOMAINS_MAX,
} from '../../shared/signup-domains'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('signup domain allowlist', () => {
  it('normalizes configured domains before matching signup emails', () => {
    const domains = normalizeSignupAllowedDomains([
      ' Example.COM ',
      '@factory.dev',
      'https://bad.example',
      'invalid domain',
      '',
      'example.com',
    ])

    expect(domains).toEqual(['example.com', 'factory.dev'])
    expect(extractSignupEmailDomain('Ada@Example.com')).toBe('example.com')
    expect(isSignupEmailDomainAllowed('ada@example.com', domains)).toBe(true)
    expect(isSignupEmailDomainAllowed('ada@other.example', domains)).toBe(false)
  })

  it('uses the shared domain normalizer in the org settings schema', () => {
    expect(signupAllowedDomainsSchema.parse([' Example.COM ', '@factory.dev', 'example.com.']))
      .toEqual(['example.com', 'factory.dev'])

    expect(() => signupAllowedDomainsSchema.parse(['https://bad.example'])).toThrow()
    expect(() => signupAllowedDomainsSchema.parse(Array.from({ length: SIGNUP_ALLOWED_DOMAINS_MAX + 1 }, (_, index) => `team-${index}.example.com`))).toThrow()
  })

  it('blocks common consumer email domains from being treated as domain evidence', () => {
    expect(isCommonConsumerEmailDomain('gmail.com')).toBe(true)
    expect(isCommonConsumerEmailDomain('acme.example')).toBe(false)
  })

  it('detects wrapped Postgres error codes from Drizzle query failures', () => {
    expect(hasPostgresErrorCode({ cause: { code: '42703' } }, '42703')).toBe(true)
    expect(hasPostgresErrorCode({ code: '42501' }, '42703')).toBe(false)
  })

  it('keeps the stable allowlist API surface wired through settings and auth', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const settingsSchema = readProjectFile('server/utils/schemas/orgSettings.ts')
    const getEndpoint = readProjectFile('server/api/org-settings/index.get.ts')
    const patchEndpoint = readProjectFile('server/api/org-settings/index.patch.ts')
    const allowlistUtil = readProjectFile('server/utils/signupDomainAllowlist.ts')
    const composable = readProjectFile('app/composables/useOrgSettings.ts')
    const authRoute = readProjectFile('server/api/auth/[...all].ts')
    const migration = readProjectFile('server/database/migrations/0039_signup_allowed_domains.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(schema).toContain('signupAllowedDomains: jsonb(\'signup_allowed_domains\').$type<string[]>().notNull().default(sql`\'[]\'::jsonb`)')
    expect(settingsSchema).toContain('signupAllowedDomains: signupAllowedDomainsSchema.optional()')
    expect(getEndpoint).toContain('signupAllowedDomains: settings?.signupAllowedDomains ?? []')
    expect(patchEndpoint).toContain('signupAllowedDomains: body.signupAllowedDomains ?? []')
    expect(patchEndpoint).toContain('assertSignupDomainAllowlistUpdateAllowed')
    expect(allowlistUtil).toContain('assertSignupDomainAllowlistUpdateAllowed')
    expect(allowlistUtil).toContain('isSignupEmailAllowedByAnyOrgAllowlist')
    expect(composable).toContain('signupAllowedDomains')
    expect(authRoute).toContain('isSignupEmailAllowedByAnyOrgAllowlist')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "signup_allowed_domains" jsonb DEFAULT \'[]\'::jsonb NOT NULL')
    expect(journal).toContain('"tag": "0039_signup_allowed_domains"')
  })

  it('documents that allowlisted signup does not grant organization membership', () => {
    const authRoute = readProjectFile('server/api/auth/[...all].ts')
    const inviteAccept = readProjectFile('server/api/invite-links/accept.post.ts')
    const joinApprove = readProjectFile('server/api/join-requests/[id]/approve.post.ts')

    expect(authRoute).toContain('isSignupEmailAllowedByAnyOrgAllowlist')
    expect(authRoute).not.toContain('.insert(member)')
    expect(inviteAccept).toContain('.insert(member)')
    expect(joinApprove).toContain('.insert(member)')
  })
})
