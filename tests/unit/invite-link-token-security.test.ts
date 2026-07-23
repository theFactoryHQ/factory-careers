import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')
const knownToken = 'ab'.repeat(32)
const knownDigest = '271a413bd339c5709fdceaec41f14f11e9fbfb5042d72d331c65f32b284cd09a'

async function loadTokenUtility(): Promise<{
  hashInviteLinkToken: (token: string) => string
} | null> {
  const utilityUrl = new URL('../../server/utils/inviteLinkToken.ts', import.meta.url).href

  try {
    return await import(utilityUrl)
  }
  catch {
    return null
  }
}

describe('shareable invite-link token storage', () => {
  it('hashes a valid raw token to deterministic lowercase SHA-256 hex', async () => {
    const utility = await loadTokenUtility()

    expect(utility, 'invite-link token utility must exist').not.toBeNull()
    expect(utility!.hashInviteLinkToken(knownToken)).toBe(knownDigest)
    expect(utility!.hashInviteLinkToken(knownToken)).toMatch(/^[0-9a-f]{64}$/)
  })

  it.each([
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'g'.repeat(64),
    `${'a'.repeat(64)}\n`,
  ])('rejects malformed raw token %j before hashing', async (rawToken) => {
    const utility = await loadTokenUtility()

    expect(utility, 'invite-link token utility must exist').not.toBeNull()
    expect(() => utility!.hashInviteLinkToken(rawToken)).toThrow(/invite link token/i)
  })

  it('maps the database field to token_hash and removes the plaintext token field', () => {
    const schema = read('server/database/schema/app.ts')
    const inviteLinkBlock = schema.slice(
      schema.indexOf("export const inviteLink = pgTable('invite_link'"),
      schema.indexOf('export const joinRequest = pgTable'),
    )

    expect(inviteLinkBlock).toContain("tokenHash: text('token_hash').notNull()")
    expect(inviteLinkBlock).toContain("uniqueIndex('invite_link_token_hash_idx').on(t.tokenHash)")
    expect(inviteLinkBlock).not.toContain("tokenHash: text('token_hash').notNull().unique()")
    expect(inviteLinkBlock).not.toMatch(/\btoken:\s*text\('token'\)/)
    expect(inviteLinkBlock).not.toContain('invite_link_token_idx')
  })

  it('backfills token hashes, removes plaintext, preserves uniqueness, and journals migration 0061', () => {
    const migrationPath = fileURLToPath(new URL(
      '../../server/database/migrations/0061_hash_invite_link_tokens.sql',
      import.meta.url,
    ))
    expect(existsSync(migrationPath), 'migration 0061 must exist').toBe(true)

    const migration = readFileSync(migrationPath, 'utf8')
    expect(migration).toContain('ADD COLUMN "token_hash" text')
    expect(migration).toContain('octet_length("token") <> 64')
    expect(migration).toContain(`"token" !~ '^[0-9a-f]+$'`)
    expect(migration).toContain("RAISE EXCEPTION 'Cannot hash invite-link tokens: invalid legacy token format'")
    expect(migration).toContain("encode(sha256(convert_to(\"token\", 'UTF8')), 'hex')")
    expect(migration).toContain('ALTER COLUMN "token_hash" SET NOT NULL')
    expect(migration).toContain('DROP CONSTRAINT "invite_link_token_unique"')
    expect(migration).toContain('DROP INDEX "invite_link_token_idx"')
    expect(migration).toContain('DROP COLUMN "token"')
    expect(migration).toContain('CREATE UNIQUE INDEX "invite_link_token_hash_idx"')

    const journal = JSON.parse(read('server/database/migrations/meta/_journal.json')) as {
      entries: Array<{ idx: number; tag: string }>
    }
    expect(journal.entries.find(entry => entry.idx === 61)).toMatchObject({
      idx: 61,
      tag: '0061_hash_invite_link_tokens',
    })
  })

  it('stores only the hash on create and returns the in-memory raw token once', () => {
    const source = read('server/api/invite-links/index.post.ts')

    expect(source).toContain('const tokenHash = hashInviteLinkToken(token)')
    expect(source).toContain('tokenHash,')
    expect(source).not.toContain('token: inviteLink.token')
    expect(source).not.toContain('tokenHash: inviteLink.tokenHash')
    expect(source).toContain('return { ...created, token }')
  })

  it('lists invite metadata without either raw tokens or token hashes', () => {
    const source = read('server/api/invite-links/index.get.ts')

    expect(source).not.toContain('token: inviteLink.token')
    expect(source).not.toContain('tokenHash')
  })

  it('hashes public info and acceptance tokens before token_hash lookup', () => {
    const infoSource = read('server/api/invite-links/info/[token].get.ts')
    const acceptSource = read('server/api/invite-links/accept.post.ts')

    expect(infoSource).toContain('hashInviteLinkToken(token)')
    expect(infoSource).toContain('eq(inviteLink.tokenHash, tokenHash)')
    expect(infoSource).not.toContain('eq(inviteLink.token, token)')
    expect(acceptSource).toContain('hashInviteLinkToken(body.token)')
    expect(acceptSource).toContain('eq(inviteLink.tokenHash, tokenHash)')
    expect(acceptSource).not.toContain('eq(inviteLink.token, body.token)')
    expect(acceptSource).toContain('acceptInviteLinkSchema.safeParse(await readBody(event))')
    expect(acceptSource).toContain('statusCode: 404')
    expect(acceptSource).toContain('Invalid, expired, or revoked invite link')
  })

  it('shows a one-time copy panel and never reads a token from listed metadata', () => {
    const composable = read('app/composables/useInviteLinks.ts')
    const page = read('app/pages/dashboard/settings/members.vue')

    expect(composable).toContain('export interface ListedInviteLink')
    expect(composable).toContain('export interface CreatedInviteLink extends InviteLinkMetadata')
    expect(composable).toContain('token: string')
    expect(composable).toContain('Promise<CreatedInviteLink>')
    expect(page).toContain('createdInviteLink')
    expect(page).toContain('This link cannot be shown again')
    expect(page).toContain('Dismiss invite link')
    expect(page).not.toContain('link.token')
  })
})
