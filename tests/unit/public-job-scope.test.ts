import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const organizationFindFirst = vi.fn()

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function makeError(opts: { statusCode: number, statusMessage?: string }) {
  return Object.assign(new Error(opts.statusMessage), opts)
}

vi.stubGlobal('createError', makeError)
vi.stubGlobal('db', {
  query: {
    organization: { findFirst: organizationFindFirst },
  },
})

const { getPublicJobScopeCondition } = await import('../../server/utils/publicJobScope')

describe('public job organization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('env', {
      FACTORY_DISABLE_PUBLIC_ORG_CREATION: true,
      FACTORY_ORG_SLUG: 'factory',
    })
    organizationFindFirst.mockResolvedValue({ id: 'factory-org' })
  })

  it('scopes anonymous job board reads to the Factory org in single-org mode', async () => {
    await expect(getPublicJobScopeCondition()).resolves.toBeTruthy()
    expect(organizationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      columns: { id: true },
    }))
  })

  it('keeps upstream multi-org deployments unscoped when public org creation is enabled', async () => {
    vi.stubGlobal('env', {
      FACTORY_DISABLE_PUBLIC_ORG_CREATION: false,
      FACTORY_ORG_SLUG: 'factory',
    })

    await expect(getPublicJobScopeCondition()).resolves.toBeUndefined()
    expect(organizationFindFirst).not.toHaveBeenCalled()
  })

  it('uses the same public scope on list, detail, and apply endpoints', () => {
    expect(readProjectFile('server/api/public/jobs/index.get.ts')).toContain('getPublicJobScopeCondition')
    expect(readProjectFile('server/api/public/jobs/[slug].get.ts')).toContain('getPublicJobScopeCondition')
    expect(readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')).toContain('getPublicJobScopeCondition')
  })
})
