import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface ReleasePresentation {
  heading: string
  description: string
  latestLabel: string
}

type GetReleaseStatusPresentation = (input: {
  loading: boolean
  releaseStatus?: 'current' | 'update-available' | 'unpublished' | 'unavailable'
  currentVersion?: string | null
  latestVersion?: string | null
}) => ReleasePresentation

async function loadPresentationHelper(): Promise<GetReleaseStatusPresentation> {
  const helperPath = join(process.cwd(), 'app/utils/releaseStatusPresentation.ts')
  if (!existsSync(helperPath)) {
    expect(existsSync(helperPath), 'release presentation helper must exist').toBe(true)
    throw new Error('release presentation helper does not exist')
  }

  const module = await import(/* @vite-ignore */ pathToFileURL(helperPath).href) as {
    getReleaseStatusPresentation: GetReleaseStatusPresentation
  }
  return module.getReleaseStatusPresentation
}

describe('getReleaseStatusPresentation', () => {
  it.each([
    {
      name: 'loading',
      input: { loading: true, releaseStatus: 'unavailable' as const, currentVersion: '1.0.0', latestVersion: null },
      expected: { heading: 'Checking for updates', description: 'Checking for updates…', latestLabel: 'Checking…' },
    },
    {
      name: 'current',
      input: { loading: false, releaseStatus: 'current' as const, currentVersion: '1.0.0', latestVersion: '1.0.0' },
      expected: { heading: 'Up to date', description: "You're running the latest version (1.0.0)", latestLabel: 'v1.0.0' },
    },
    {
      name: 'update available',
      input: { loading: false, releaseStatus: 'update-available' as const, currentVersion: '1.0.0', latestVersion: '1.1.0' },
      expected: { heading: 'Update available', description: "Version 1.1.0 is available (you're on 1.0.0)", latestLabel: 'v1.1.0' },
    },
    {
      name: 'unpublished',
      input: { loading: false, releaseStatus: 'unpublished' as const, currentVersion: '1.0.0', latestVersion: null },
      expected: {
        heading: 'No Factory release published yet',
        description: 'Local v1.0.0 is the Factory baseline; its GitHub release is pending.',
        latestLabel: 'Not published',
      },
    },
    {
      name: 'unavailable',
      input: { loading: false, releaseStatus: 'unavailable' as const, currentVersion: '1.0.0', latestVersion: null },
      expected: {
        heading: 'Unable to check',
        description: 'Could not check for updates. Verify your network connection and try again.',
        latestLabel: '—',
      },
    },
  ])('maps the $name state', async ({ input, expected }) => {
    const getReleaseStatusPresentation = await loadPresentationHelper()

    expect(getReleaseStatusPresentation(input)).toEqual(expected)
  })
})
