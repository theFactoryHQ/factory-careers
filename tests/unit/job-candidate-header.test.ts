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
      source.indexOf('factory-candidate-header-actions'),
      source.indexOf('<!-- Detail tabs -->'),
    )

    expect(headerActions).toContain('sm:self-stretch')
    expect(headerActions.indexOf('@click="goToNextCard"')).toBeLessThan(headerActions.indexOf('<ApplicationTimestampStack'))
    expect(headerActions).toContain(':applied-at="currentSummary.createdAt"')
    expect(headerActions).toContain(':updated-at="currentSummary.updatedAt"')
  })

  it('uses a dedicated mobile layout recipe for the selected candidate header', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const styles = readProjectFile('app/assets/css/main.css')
    const header = source.slice(
      source.indexOf('<!-- Candidate header -->'),
      source.indexOf('<!-- Detail tabs -->'),
    )

    for (const className of [
      'factory-candidate-header',
      'factory-candidate-header-inner',
      'factory-candidate-header-primary',
      'factory-candidate-header-title-row',
      'factory-candidate-header-score',
      'factory-candidate-header-actions',
      'factory-candidate-header-pager',
    ]) {
      expect(header).toContain(className)
    }

    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.factory-candidate-header-inner\s*\{[\s\S]*gap:\s*18px;/)
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.factory-candidate-header-title-row\s*\{[\s\S]*align-items:\s*flex-start;[\s\S]*flex-direction:\s*column;/)
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.factory-candidate-header-actions\s*\{[\s\S]*align-items:\s*flex-end;[\s\S]*flex-direction:\s*row-reverse;/)
  })

  it('keeps the mobile candidate selector opaque over page content', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const styles = readProjectFile('app/assets/css/main.css')

    expect(source).toContain('factory-mobile-candidate-bar')
    expect(source).toContain('factory-mobile-candidate-card')
    expect(styles).toMatch(/\.factory-mobile-candidate-bar\s*\{[\s\S]*background-color:\s*#050505 !important;/)
    expect(styles).toMatch(/\.factory-mobile-candidate-card\s*\{[\s\S]*background-color:\s*#050505 !important;/)
    expect(styles).toMatch(/\.factory-mobile-candidate-card-active\s*\{[\s\S]*background-color:\s*color-mix\(in srgb, var\(--color-brand-500\) 18%, #050505\) !important;/)
  })

  it('keeps overview as a plain detail tab without section checkboxes', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const detailTabs = source.slice(
      source.indexOf('<!-- Detail tabs -->'),
      source.indexOf('<!-- Detail content -->'),
    )

    expect(detailTabs).toContain("@click=\"detailTab = 'overview'\"")
    expect(source).not.toContain('showOverviewDropdown')
    expect(source).not.toContain('overviewSections')
    expect(detailTabs).not.toContain('type="checkbox"')
    expect(detailTabs).not.toContain('Sections')
  })

  it('keeps candidate detail tabs fixed-width and icon-first instead of horizontally scrollable', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const styles = readProjectFile('app/assets/css/main.css')
    const detailTabs = source.slice(
      source.indexOf('<!-- Detail tabs -->'),
      source.indexOf('<!-- Detail content -->'),
    )

    expect(detailTabs).toContain('factory-candidate-detail-tabs mx-auto grid h-11 max-w-4xl grid-cols-7')
    expect(detailTabs).not.toContain('overflow-x-auto')
    expect(detailTabs).not.toContain('whitespace-nowrap')
    for (const icon of ['UserRound', 'Brain', 'Calendar', 'FileText', 'MessageSquare', 'History', 'SlidersHorizontal']) {
      expect(detailTabs).toContain(`<${icon} class="factory-candidate-detail-tab-icon size-4"`)
    }
    expect(detailTabs).toContain('factory-candidate-detail-tab-tooltip')
    expect(styles).toContain('@media (max-width: 1280px)')
    expect(styles).toContain('.factory-candidate-detail-tab-label')
    expect(styles).toContain('.factory-candidate-detail-tab-tooltip')
    expect(styles).toContain('clip: rect(0, 0, 0, 0);')
  })
})
