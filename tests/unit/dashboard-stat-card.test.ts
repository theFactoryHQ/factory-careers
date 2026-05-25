import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('DashboardStatCard consolidation', () => {
  it('defines a reusable dashboard stat-card component with configurable accents', () => {
    const source = readProjectFile('app/components/DashboardStatCard.vue')

    expect(source).toContain("accent: 'brand'")
    expect(source).toContain('as?: string')
    expect(source).toContain('to?:')
    expect(source).toContain('valueClass?: string')
    expect(source).toContain('dotClass?: string')
    expect(source).toContain('iconClass?: string')
    expect(source).toContain('accentLineClass?: string')
    expect(source).toContain('labelClass?: string')
    expect(source).toContain('captionClass?: string')
    expect(source).toContain('extraMetric')
    expect(source).toContain('is="componentTag"')
    expect(source).toContain('ui-dashboard-stat-card')
    expect(source).toContain('factory-dashboard-stat-dot')
    expect(source).toContain('<slot name="value"')
    expect(source).toContain('<slot name="caption"')
    expect(source).toContain('<slot name="extra"')
  })

  it('uses DashboardStatCard for the stat grids called out by issue 92', () => {
    const callSites = [
      'app/pages/dashboard/index.vue',
      'app/pages/dashboard/source-tracking/index.vue',
      'app/pages/dashboard/source-tracking/[id].vue',
      'app/pages/dashboard/ai-analysis.vue',
    ]

    for (const path of callSites) {
      const source = readProjectFile(path)
      expect(source, path).toContain('<DashboardStatCard')
      expect(source, path).not.toContain('absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent')
      expect(source, path).not.toContain('text-[11px] text-surface-300 dark:text-surface-600 mt-1')
      expect(source, path).not.toContain('class="group ui-dashboard-stat-card')
    }
  })
})
