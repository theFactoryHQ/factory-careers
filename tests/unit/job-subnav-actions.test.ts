import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job subnav actions', () => {
  it('does not render keyboard shortcut hints as subnav action controls', () => {
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(jobDetail).toContain('<JobSubNavActions :job-id="jobId" />')
    expect(jobDetail).not.toContain('Keyboard shortcut hints in sub-nav bar')
    expect(jobDetail).not.toContain('<span>candidates</span>')
    expect(jobDetail).not.toContain('<span>stages</span>')
    expect(jobDetail).not.toContain('<span>actions</span>')
  })

  it('uses the applications toolbar button recipe for the pipeline fullscreen control', () => {
    const applications = readProjectFile('app/pages/dashboard/applications/index.vue')
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(applications).toContain('factory-toolbar-button inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors')
    expect(jobDetail).toContain('factory-toolbar-button ml-auto inline-flex h-8 min-h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-0 text-sm font-medium transition-colors')
    expect(jobDetail).toContain(":title=\"isFullscreen ? 'Exit fullscreen' : 'Fullscreen pipeline'\"")
    expect(jobDetail).toContain(":aria-label=\"isFullscreen ? 'Exit fullscreen' : 'Fullscreen pipeline'\"")
  })

  it('keeps the teleported job actions menu opaque and readable', () => {
    const actions = readProjectFile('app/components/JobSubNavActions.vue')
    const css = readProjectFile('app/assets/css/main.css')
    const menuRule = css.match(/\.factory-job-more-menu\s*\{[^}]+\}/)?.[0] ?? ''
    const itemRule = css.match(/\.factory-job-more-menu \.factory-job-more-menu-item\s*\{[^}]+\}/)?.[0] ?? ''
    const globalItemSvgRule = css.match(/\.factory-job-more-menu \.factory-job-more-menu-item svg\s*\{[^}]+\}/)?.[0] ?? ''
    const scopedItemSvgRule = css.match(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) \.factory-job-more-menu-item svg\s*\{[^}]+\}/)?.[0] ?? ''
    const globalItemHoverRule = css.match(/\.factory-job-more-menu \.factory-job-more-menu-item:hover\s*\{[^}]+\}/)?.[0] ?? ''
    const scopedItemHoverRule = css.match(/:where\(\.factory-dashboard-shell, \.factory-dashboard-portal\) \.factory-job-more-menu-item:hover\s*\{[^}]+\}/)?.[0] ?? ''

    expect(actions).toContain('class="factory-job-more-menu z-[200] w-64 border border-white/12 bg-black py-1 shadow-2xl shadow-black/50 overflow-hidden origin-top-right"')
    expect(actions).toContain('px-4 py-2 text-sm text-white/62 hover:bg-white/[0.05] hover:text-white')
    expect(actions).toContain('Job properties')
    expect(actions).toContain('Org properties')
    expect(actions).toContain('ArchiveIcon')
    expect(actions).toContain('<ArchiveIcon')
    expect(actions).toContain('v-if="showArchiveTransition"')
    expect(actions).toContain("handleJobTransition('archived'); showMoreMenu = false")
    expect(actions).toContain('v-for="t in otherSecondaryJobTransitions"')
    expect(actions).toContain('class="size-3.5 shrink-0"')
    expect(actions).toContain('aria-hidden="true"')
    expect(actions).not.toContain('factory-job-more-menu-divider')
    expect(actions).not.toContain('Manage job-specific properties')
    expect(actions).not.toContain('Manage org-wide application properties')
    expect(actions).not.toContain('w-56 border py-1.5')
    expect(actions).not.toContain('px-3 py-2 text-[13px]')
    expect(actions).not.toContain('px-3.5 py-2 text-sm')
    expect(menuRule).toContain('background-color: #050505 !important')
    expect(menuRule).toContain('border-color: rgb(255 255 255 / 0.12) !important')
    expect(menuRule).toContain('color: #ffffff !important')
    expect(itemRule).toContain('color: rgb(255 255 255 / 0.62) !important')
    expect(itemRule).toContain('text-align: left !important')
    expect(itemRule).toContain('white-space: nowrap !important')
    for (const rule of [globalItemSvgRule, scopedItemSvgRule]) {
      expect(rule).toContain('color: currentColor !important')
      expect(rule).not.toContain('var(--color-brand-400)')
    }
    for (const rule of [globalItemHoverRule, scopedItemHoverRule]) {
      expect(rule).toContain('background-color: rgb(255 255 255 / 0.05) !important')
      expect(rule).not.toContain('color-mix(in srgb, var(--color-brand-500) 14%, transparent)')
    }
  })

  it('labels pipeline stage chips and keeps their strip compact', () => {
    const jobDetail = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')

    expect(jobDetail).toContain('Pipeline stages')
    expect(jobDetail).toContain('factory-pipeline-stage-strip-label')
    expect(jobDetail).toContain('factory-pipeline-stage-strip shrink-0 border-b')
    expect(jobDetail).toContain('px-3 sm:px-5 py-1')
    expect(jobDetail).toContain('factory-pipeline-status-chip relative flex h-8')
    expect(jobDetail).toContain('factory-pipeline-status-chip-label')
    expect(jobDetail).toContain('factory-pipeline-status-chip-stage')
    expect(jobDetail).toContain('factory-pipeline-status-chip-count')
    expect(jobDetail).toContain('<span class="factory-pipeline-status-chip-stage tabular-nums">{{ idx + 1 }}</span>')
    expect(jobDetail).not.toContain('factory-pipeline-status-chip-number factory-pipeline-status-chip-stage')
    expect(jobDetail).toContain(':title="`${formatStatusLabel(status)} stage ${idx + 1}, ${statusCounts[status] ?? 0} applicants`"')
  })

  it('keeps job subnav action buttons the same 32px height as sibling tabs', () => {
    const actions = readProjectFile('app/components/JobSubNavActions.vue')
    const css = readProjectFile('app/assets/css/main.css')
    const addCandidateButton = actions.match(/Add Candidate[\s\S]*?<\/button>/)?.[0] ?? ''
    const statusActionRule = css.match(/\.factory-job-status-action\s*\{[^}]+\}/)?.[0] ?? ''
    const moreButtonRule = css.match(/\.factory-job-more-button\s*\{[^}]+\}/)?.[0] ?? ''

    expect(addCandidateButton).toContain('h-8 min-h-8')
    expect(addCandidateButton).not.toContain('h-7 min-h-7')
    expect(statusActionRule).toContain('height: 32px')
    expect(statusActionRule).toContain('min-height: 32px')
    expect(moreButtonRule).toContain('height: 32px')
    expect(moreButtonRule).toContain('width: 32px')
  })
})
