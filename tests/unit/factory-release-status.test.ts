import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLatestFactoryRelease } from '../../server/utils/factoryRelease'

const publishedRelease = {
  tag_name: 'v1.0.0',
  html_url: 'https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0',
  body: 'Factory Careers independent release baseline.',
  published_at: '2026-07-16T12:00:00Z',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Factory release lookup', () => {
  it('returns a validated published release from the Factory repository', async () => {
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    const fetchImpl = vi.fn(async () => Response.json(publishedRelease))

    await expect(fetchLatestFactoryRelease('1.0.0', fetchImpl as typeof fetch)).resolves.toEqual({
      status: 'published',
      release: publishedRelease,
    })
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/theFactoryHQ/factory-careers/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Factory-Careers/1.0.0',
        },
        signal,
      },
    )
  })

  it('distinguishes an unpublished first release from lookup failures', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))

    await expect(fetchLatestFactoryRelease('1.0.0', fetchImpl as typeof fetch)).resolves.toEqual({
      status: 'unpublished',
    })
  })

  it.each([
    ['a non-404 GitHub error', async () => new Response(null, { status: 503 })],
    ['an invalid JSON body', async () => new Response('{invalid-json', { status: 200 })],
    ['a malformed release payload', async () => Response.json({ ...publishedRelease, tag_name: 100 })],
    ['a non-semver release tag', async () => Response.json({ ...publishedRelease, tag_name: 'factory-release' })],
    ['a thrown fetch', async () => { throw new Error('network unavailable') }],
  ])('returns unavailable for %s', async (_name, implementation) => {
    await expect(fetchLatestFactoryRelease('1.0.0', implementation as typeof fetch)).resolves.toEqual({
      status: 'unavailable',
    })
  })
})
