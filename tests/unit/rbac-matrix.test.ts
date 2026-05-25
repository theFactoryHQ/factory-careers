import { describe, expect, it } from 'vitest'
import { admin, member, owner } from '../../shared/permissions'

type Role = {
  statements: Record<string, readonly string[]>
}

function can(role: Role, resource: string, action: string): boolean {
  return role.statements[resource]?.includes(action) ?? false
}

describe('production RBAC matrix', () => {
  it('keeps organization deletion owner-only', () => {
    expect(can(owner, 'organization', 'delete')).toBe(true)
    expect(can(admin, 'organization', 'delete')).toBe(false)
    expect(can(member, 'organization', 'delete')).toBe(false)
  })

  it('prevents members from mutating admin-owned resources', () => {
    for (const action of ['create', 'update', 'delete']) {
      expect(can(member, 'job', action)).toBe(false)
    }

    expect(can(member, 'candidate', 'delete')).toBe(false)
    expect(can(member, 'application', 'delete')).toBe(false)
    expect(can(member, 'document', 'update')).toBe(false)
    expect(can(member, 'document', 'delete')).toBe(false)
    expect(can(member, 'organization', 'update')).toBe(false)
    expect(can(member, 'privacyRequest', 'read')).toBe(false)
    expect(can(member, 'privacyRequest', 'update')).toBe(false)
  })

  it('prevents members from editing or deleting comments', () => {
    expect(can(member, 'comment', 'create')).toBe(true)
    expect(can(member, 'comment', 'read')).toBe(true)
    expect(can(member, 'comment', 'update')).toBe(false)
    expect(can(member, 'comment', 'delete')).toBe(false)
  })

  it('keeps organization configuration surfaces admin-managed', () => {
    expect(can(member, 'emailTemplate', 'read')).toBe(true)
    expect(can(member, 'emailTemplate', 'create')).toBe(false)
    expect(can(member, 'emailTemplate', 'update')).toBe(false)
    expect(can(member, 'emailTemplate', 'delete')).toBe(false)

    expect(can(member, 'scoring', 'read')).toBe(true)
    expect(can(member, 'scoring', 'create')).toBe(true)
    expect(can(member, 'scoring', 'update')).toBe(false)
    expect(can(member, 'scoring', 'delete')).toBe(false)
  })

  it('allows members to do ordinary recruiter work', () => {
    expect(can(member, 'job', 'read')).toBe(true)
    expect(can(member, 'candidate', 'create')).toBe(true)
    expect(can(member, 'candidate', 'read')).toBe(true)
    expect(can(member, 'candidate', 'update')).toBe(true)
    expect(can(member, 'application', 'create')).toBe(true)
    expect(can(member, 'application', 'read')).toBe(true)
    expect(can(member, 'application', 'update')).toBe(true)
    expect(can(member, 'document', 'create')).toBe(true)
    expect(can(member, 'document', 'read')).toBe(true)
    expect(can(member, 'activityLog', 'read')).toBe(true)
  })

  it('allows admins to manage ATS resources without owner-only org deletion', () => {
    for (const resource of [
      'job',
      'candidate',
      'application',
      'document',
      'comment',
      'interview',
      'emailTemplate',
      'scoring',
      'sourceTracking',
    ]) {
      for (const action of ['create', 'read', 'update', 'delete']) {
        expect(can(admin, resource, action)).toBe(true)
      }
    }

    expect(can(admin, 'privacyRequest', 'read')).toBe(true)
    expect(can(admin, 'privacyRequest', 'update')).toBe(true)
    expect(can(admin, 'privacyRequest', 'create')).toBe(false)
    expect(can(admin, 'privacyRequest', 'delete')).toBe(false)
    expect(can(admin, 'organization', 'read')).toBe(true)
    expect(can(admin, 'organization', 'update')).toBe(true)
  })
})
