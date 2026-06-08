import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'
import postgres, { type Sql } from 'postgres'

export type MembershipLookup = {
  userId: string
  memberId: string
  organizationId: string
}

export type MemberRoleLookup = {
  id: string
  role: string
}

export type JoinRequestStatusLookup = {
  status: string
  reviewedAt: Date | null
}

export type ApplicationLookup = {
  applicationId: string
  candidateId: string
  organizationId: string
}

export type PrivacyRequestRecord = {
  id: string
  organizationId: string | null
  status: string
  requesterName: string
  requesterEmail: string
  stateOfResidence: string
  applicationId: string | null
  details: string | null
  verificationTokenHash: string
  verifiedAt: Date | null
  completedAt: Date | null
  resolutionNotes: string | null
}

export type CandidateApplicationRecord = {
  candidateId: string
  applicationId: string
  organizationId: string
}

export function assertE2eDatabaseUrl(label: string): string {
  const databaseUrl = process.env.DATABASE_URL
  expect(databaseUrl, `DATABASE_URL is required for ${label}`).toBeTruthy()
  return databaseUrl!
}

export function createE2eDb(label: string): Sql {
  return postgres(assertE2eDatabaseUrl(label), { max: 1 })
}

export async function closeE2eDb(sql: Sql): Promise<void> {
  await sql.end()
}

export async function withE2eDb<T>(label: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = createE2eDb(label)
  try {
    return await fn(sql)
  }
  finally {
    await closeE2eDb(sql)
  }
}

export async function lookupMembership(email: string, organizationName: string): Promise<MembershipLookup> {
  return withE2eDb('membership lookup e2e coverage', async (sql) => {
    const [membership] = await sql<MembershipLookup[]>`
      select
        u.id as "userId",
        m.id as "memberId",
        o.id as "organizationId"
      from "user" u
      inner join "member" m on m."user_id" = u.id
      inner join "organization" o on o.id = m."organization_id"
      where u.email = ${email} and o.name = ${organizationName}
      limit 1
    `

    expect(membership, `expected ${email} to belong to ${organizationName}`).toBeTruthy()
    return membership!
  })
}

export async function lookupMemberByEmail(
  email: string,
  organizationId: string,
): Promise<MemberRoleLookup | undefined> {
  return withE2eDb('member lookup e2e coverage', async (sql) => {
    const [member] = await sql<MemberRoleLookup[]>`
      select m.id, m.role
      from "member" m
      inner join "user" u on u.id = m."user_id"
      where u.email = ${email} and m."organization_id" = ${organizationId}
      limit 1
    `
    return member
  })
}

export async function lookupJoinRequestStatus(requestId: string): Promise<JoinRequestStatusLookup | undefined> {
  return withE2eDb('join-request lookup e2e coverage', async (sql) => {
    const [request] = await sql<JoinRequestStatusLookup[]>`
      select status, "reviewed_at" as "reviewedAt"
      from "join_request"
      where id = ${requestId}
      limit 1
    `
    return request
  })
}

export async function lookupApplicationByEmail(email: string): Promise<ApplicationLookup> {
  return withE2eDb('application lookup e2e coverage', async (sql) => {
    const [row] = await sql<ApplicationLookup[]>`
      select
        a.id as "applicationId",
        c.id as "candidateId",
        a.organization_id as "organizationId"
      from application a
      inner join candidate c on c.id = a.candidate_id
      where c.email = ${email}
      order by a.created_at desc
      limit 1
    `

    expect(row, `expected application for ${email}`).toBeTruthy()
    return row!
  })
}

export async function seedParsedResume(params: {
  organizationId: string
  candidateId: string
  resumeText: string
}) {
  return withE2eDb('parsed resume seed e2e coverage', async (sql) => {
    const documentId = randomUUID()

    await sql`
      insert into document (
        id,
        organization_id,
        candidate_id,
        type,
        storage_key,
        original_filename,
        mime_type,
        size_bytes,
        parsed_content
      )
      values (
        ${documentId},
        ${params.organizationId},
        ${params.candidateId},
        'resume',
        ${`${params.organizationId}/${params.candidateId}/${documentId}.txt`},
        'deterministic-resume.txt',
        'text/plain',
        ${params.resumeText.length},
        ${sql.json({ text: params.resumeText })}
      )
    `
  })
}

export async function seedCrossTenantSentinel(sentinel: string) {
  return withE2eDb('cross-tenant sentinel seed e2e coverage', async (sql) => {
    const orgId = randomUUID()
    const candidateId = randomUUID()
    const jobId = randomUUID()
    const applicationId = randomUUID()
    const documentId = randomUUID()

    await sql.begin(async (tx) => {
      await tx`
        insert into organization (id, name, slug)
        values (${orgId}, ${`Sentinel Org ${orgId.slice(0, 8)}`}, ${`sentinel-${orgId.slice(0, 8)}`})
      `
      await tx`
        insert into job (id, organization_id, title, slug, description, status, active_from)
        values (${jobId}, ${orgId}, 'Sentinel Role', ${`sentinel-role-${jobId.slice(0, 8)}`}, ${sentinel}, 'open', now())
      `
      await tx`
        insert into candidate (id, organization_id, first_name, last_name, email)
        values (${candidateId}, ${orgId}, 'Cross', 'Tenant', ${`cross-tenant-${candidateId}@example.com`})
      `
      await tx`
        insert into application (id, organization_id, candidate_id, job_id, cover_letter_text)
        values (${applicationId}, ${orgId}, ${candidateId}, ${jobId}, ${sentinel})
      `
      await tx`
        insert into document (
          id,
          organization_id,
          candidate_id,
          type,
          storage_key,
          original_filename,
          mime_type,
          size_bytes,
          parsed_content
        )
        values (
          ${documentId},
          ${orgId},
          ${candidateId},
          'resume',
          ${`${orgId}/${candidateId}/${documentId}.txt`},
          'sentinel-resume.txt',
          'text/plain',
          ${sentinel.length},
          ${tx.json({ text: sentinel })}
        )
      `
    })
  })
}

export async function grantOrganizationRole(
  userId: string,
  organizationId: string,
  role: 'admin' | 'member',
): Promise<string> {
  return withE2eDb('organization role grant e2e coverage', async (sql) => {
    const result = await sql.begin(async (tx) => {
      const [membership] = await tx<{ id: string }[]>`
        insert into "member" ("id", "user_id", "organization_id", "role")
        values (${randomUUID()}, ${userId}, ${organizationId}, ${role})
        on conflict ("user_id", "organization_id")
        do update set "role" = ${role}
        returning "id"
      `

      const updatedSessions = await tx<{ id: string }[]>`
        update "session"
        set "active_organization_id" = ${organizationId}, "updated_at" = now()
        where "user_id" = ${userId}
        returning "id"
      `

      return { membership, updatedSessions }
    })

    expect(result.updatedSessions.length, `expected an active session for ${userId}`).toBeGreaterThan(0)
    expect(result.membership?.id, `expected ${role} membership to exist after grant`).toBeTruthy()
    return result.membership!.id
  })
}

export async function deleteMembership(userId: string, organizationId: string) {
  return withE2eDb('stale-membership e2e coverage', async (sql) => {
    await sql`delete from "member" where "user_id" = ${userId} and "organization_id" = ${organizationId}`
  })
}

export async function expireInviteLink(linkId: string) {
  return withE2eDb('invite-link e2e coverage', async (sql) => {
    await sql`
      update "invite_link"
      set "expires_at" = now() - interval '1 hour'
      where "id" = ${linkId}
    `
  })
}

export async function attributeApplicationSource(
  organizationId: string,
  applicationId: string,
  trackingLinkId: string,
) {
  return withE2eDb('source-tracking e2e coverage', async (sql) => {
    await sql.begin(async (tx) => {
      await tx`
        insert into "application_source" (
          "id",
          "organization_id",
          "application_id",
          "channel",
          "tracking_link_id",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "referrer_domain"
        )
        values (
          ${randomUUID()},
          ${organizationId},
          ${applicationId},
          'linkedin',
          ${trackingLinkId},
          'linkedin',
          'social',
          'tenant-isolation',
          'linkedin.com'
        )
      `

      await tx`
        update "tracking_link"
        set "application_count" = "application_count" + 1
        where "id" = ${trackingLinkId}
      `
    })
  })
}

export async function insertSsoProvider(
  organizationId: string,
  userId: string,
  providerId: string,
): Promise<string> {
  return withE2eDb('SSO provider e2e coverage', async (sql) => {
    const id = randomUUID()

    await sql`
      insert into "sso_provider" (
        "id",
        "issuer",
        "domain",
        "oidc_config",
        "user_id",
        "provider_id",
        "organization_id"
      )
      values (
        ${id},
        ${`https://idp-${providerId}.example.com`},
        ${`${providerId}.example.com`},
        '{}',
        ${userId},
        ${providerId},
        ${organizationId}
      )
    `
    return id
  })
}

export async function lookupPrivacyRequest(requesterEmail: string): Promise<PrivacyRequestRecord | null> {
  return withE2eDb('privacy request lookup e2e coverage', async (sql) => {
    const [request] = await sql<PrivacyRequestRecord[]>`
      select
        id,
        organization_id as "organizationId",
        status,
        requester_name as "requesterName",
        requester_email as "requesterEmail",
        state_of_residence as "stateOfResidence",
        application_id as "applicationId",
        details,
        verification_token_hash as "verificationTokenHash",
        verified_at as "verifiedAt",
        completed_at as "completedAt",
        resolution_notes as "resolutionNotes"
      from privacy_request
      where requester_email = ${requesterEmail}
      order by created_at desc
      limit 1
    `

    return request ?? null
  })
}

export async function lookupCandidateApplication(requesterEmail: string): Promise<CandidateApplicationRecord | null> {
  return withE2eDb('candidate application lookup e2e coverage', async (sql) => {
    const [record] = await sql<CandidateApplicationRecord[]>`
      select
        c.id as "candidateId",
        a.id as "applicationId",
        c.organization_id as "organizationId"
      from candidate c
      join application a on a.candidate_id = c.id and a.organization_id = c.organization_id
      where c.email = ${requesterEmail}
      order by a.created_at desc
      limit 1
    `

    return record ?? null
  })
}

export async function countCandidateRows(candidateId: string): Promise<number> {
  return withE2eDb('candidate row count e2e coverage', async (sql) => {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from candidate
      where id = ${candidateId}
    `
    return row?.count ?? 0
  })
}

export async function countApplicationRows(applicationId: string): Promise<number> {
  return withE2eDb('application row count e2e coverage', async (sql) => {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from application
      where id = ${applicationId}
    `
    return row?.count ?? 0
  })
}

export async function countPrivacyAuditRows(organizationId: string, requestId: string): Promise<number> {
  return withE2eDb('privacy audit row count e2e coverage', async (sql) => {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from activity_log
      where organization_id = ${organizationId}
        and resource_type = 'privacy_request'
        and resource_id = ${requestId}
        and action = 'deleted'
    `
    return row?.count ?? 0
  })
}