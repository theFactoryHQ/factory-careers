import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job candidate header', () => {
  it('links the selected candidate name to the application page without a separate header icon link', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const header = source.slice(
      source.indexOf('<h2 class="truncate text-xl'),
      source.indexOf('<!-- Detail tabs -->'),
    )

    expect(header).toContain(':to="$localePath(`/dashboard/applications/${currentSummary.id}`)"')
    expect(header).toContain('formatPersonName(currentSummary.candidateFirstName, currentSummary.candidateLastName)')
    expect(header).not.toContain('title="Full application page"')
    expect(header).not.toContain('<ExternalLink class="size-4"')
  })

  it('positions timestamps at the bottom of the selected candidate header actions', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const headerActions = source.slice(
      source.indexOf('flex shrink-0 flex-col items-end justify-between'),
      source.indexOf('<!-- Detail tabs -->'),
    )

    expect(headerActions).toContain('sm:self-stretch')
    expect(headerActions.indexOf('@click="goToNextCard"')).toBeLessThan(headerActions.indexOf('<ApplicationTimestampStack'))
    expect(headerActions).toContain(':applied-at="currentSummary.createdAt"')
    expect(headerActions).toContain(':updated-at="currentSummary.updatedAt"')
  })
})
