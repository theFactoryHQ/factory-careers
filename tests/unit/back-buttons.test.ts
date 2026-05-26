import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readSource = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

function elementContaining(source: string, tag: string, text: string) {
  const marker = source.indexOf(text)
  if (marker === -1) return ''

  const start = source.lastIndexOf(`<${tag}`, marker)
  const end = source.indexOf(`</${tag}>`, marker)
  return start === -1 || end === -1 ? '' : source.slice(start, end + tag.length + 3)
}

describe('back button hover treatment', () => {
  const expectedHover = 'hover:bg-white hover:text-black'

  it('uses white-fill hover for the shared back link', () => {
    const source = readSource('app/components/AppBackLink.vue')

    expect(source).toContain('border border-transparent')
    expect(source).toContain(expectedHover)
    expect(source).not.toContain('hover:border-brand-500')
  })

  it('uses a dashboard-level recipe so back link hover wins over generic controls', () => {
    const css = readSource('app/assets/css/main.css')
    const source = readSource('app/components/AppBackLink.vue')
    const topbar = readSource('app/components/AppTopBar.vue')

    expect(source).toContain('factory-back-button')
    expect(topbar).toContain('factory-back-button')
    expect(css).toMatch(/\.factory-back-button:hover\s*\{[\s\S]*border-color:\s*#ffffff !important;[\s\S]*background-color:\s*#ffffff !important;[\s\S]*color:\s*#080808 !important;/)
  })

  it('uses white-fill hover for the job context chevron back link', () => {
    const source = readSource('app/components/AppTopBar.vue')
    const allJobsLink = elementContaining(source, 'NuxtLink', 'aria-label="All jobs"')

    expect(allJobsLink).toContain(expectedHover)
    expect(allJobsLink).not.toContain('hover:text-white')
  })

  it('uses white-fill hover for the auth header open positions link without a back arrow', () => {
    const source = readSource('app/layouts/auth.vue')
    const openPositionsLink = elementContaining(source, 'NuxtLink', 'Open Positions')

    expect(openPositionsLink).toContain(expectedHover)
    expect(source).not.toContain("import { ArrowLeft }")
    expect(openPositionsLink).not.toContain('<ArrowLeft')
    expect(openPositionsLink).not.toContain('hover:text-brand-500')
  })

  it('uses the shared back link on public job apply pages', () => {
    const source = readSource('app/pages/jobs/[slug]/apply.vue')
    const backLink = source.match(/<AppBackLink[\s\S]*?Back to job details[\s\S]*?<\/AppBackLink>/)?.[0] ?? ''

    expect(backLink).toContain('AppBackLink')
    expect(backLink).not.toContain('hover:text-brand-500')
  })

  it('uses white-fill hover for inline document preview back buttons', () => {
    const documentsPanel = readSource('app/components/CandidateDocumentsPanel.vue')
    const sidebar = readSource('app/components/CandidateDetailSidebar.vue')

    for (const source of [documentsPanel, sidebar]) {
      const backButton = elementContaining(source, 'button', 'Back to documents')
      expect(backButton).toContain(expectedHover)
      expect(backButton).not.toContain('ui-inline-link-brand')
    }
  })
})
