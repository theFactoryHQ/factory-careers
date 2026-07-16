export type FactoryReleaseStatus = 'current' | 'update-available' | 'unpublished' | 'unavailable'

export interface ReleaseStatusPresentationInput {
  loading: boolean
  releaseStatus?: FactoryReleaseStatus
  currentVersion?: string | null
  latestVersion?: string | null
}

export interface ReleaseStatusPresentation {
  heading: string
  description: string
  latestLabel: string
}

function versionLabel(version: string | null | undefined): string {
  return version ? `v${version}` : '—'
}

export function getReleaseStatusPresentation(
  input: ReleaseStatusPresentationInput,
): ReleaseStatusPresentation {
  if (input.loading) {
    return {
      heading: 'Checking for updates',
      description: 'Checking for updates…',
      latestLabel: 'Checking…',
    }
  }

  switch (input.releaseStatus) {
    case 'current':
      return {
        heading: 'Up to date',
        description: `You're running the latest version (${input.currentVersion ?? 'unknown'})`,
        latestLabel: versionLabel(input.latestVersion ?? input.currentVersion),
      }
    case 'update-available':
      return {
        heading: 'Update available',
        description: `Version ${input.latestVersion ?? 'unknown'} is available (you're on ${input.currentVersion ?? 'unknown'})`,
        latestLabel: versionLabel(input.latestVersion),
      }
    case 'unpublished':
      return {
        heading: 'No Factory release published yet',
        description: `Local v${input.currentVersion ?? 'unknown'} is the Factory baseline; its GitHub release is pending.`,
        latestLabel: 'Not published',
      }
    case 'unavailable':
    default:
      return {
        heading: 'Unable to check',
        description: 'Could not check for updates. Verify your network connection and try again.',
        latestLabel: '—',
      }
  }
}
