import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event, EventHandlerRequest } from 'h3'

const hasPermission = vi.fn(async () => ({ error: null, success: true }))

vi.stubGlobal('auth', {
  api: {
    getSession: vi.fn(async () => ({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-1' },
    })),
    hasPermission,
  },
})

vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string }) => {
  const err = new Error(opts.statusMessage ?? 'error') as Error & {
    statusCode: number
    statusMessage?: string
  }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
})

const { requirePermission } = await import('../../server/utils/requirePermission')

function makeEvent(): H3Event<EventHandlerRequest> {
  return { headers: new Headers() } as unknown as H3Event<EventHandlerRequest>
}

describe('requirePermission', () => {
  beforeEach(() => {
    hasPermission.mockClear()
    hasPermission.mockResolvedValue({ error: null, success: true })
  })

  it('rejects empty permission requests instead of delegating an allow-all check', async () => {
    await expect(requirePermission(makeEvent(), {})).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden: no permissions requested',
    })

    expect(hasPermission).not.toHaveBeenCalled()
  })

  it('rejects permission checks that return success false without an error', async () => {
    hasPermission.mockResolvedValueOnce({ error: null, success: false })

    await expect(requirePermission(makeEvent(), { job: ['create'] })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden: insufficient permissions',
    })
  })
})
