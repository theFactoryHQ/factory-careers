import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
}))

vi.mock('~/utils/auth-client', () => ({
  authClient: {
    useSession: mocks.useSession,
  },
}))

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.useSession.mockReset()
    vi.stubGlobal('useFetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('awaits Better Auth useFetch session promise and exposes the session ref', async () => {
    const session = ref(null)
    const error = ref(null)

    mocks.useSession.mockResolvedValue({
      data: session,
      isPending: false,
      error,
    })

    const { useAuthSession } = await import('../../app/composables/useAuthSession')

    const result = await useAuthSession()

    expect(mocks.useSession).toHaveBeenCalledWith(useFetch)
    expect(result.session).toBe(session)
    expect(result.isPending).toBe(false)
    expect(result.error).toBe(error)
  })
})
