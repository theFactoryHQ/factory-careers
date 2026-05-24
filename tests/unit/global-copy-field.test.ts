import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('global copy field', () => {
  it('provides a reusable click-anywhere copy field with animated success state', () => {
    const component = readProjectFile('app/components/CopyField.vue')

    expect(component).toContain('navigator.clipboard.writeText(props.value)')
    expect(component).toContain('@click="copyValue"')
    expect(component).toContain('CheckCircle2')
    expect(component).toContain('copied ?')
    expect(component).toContain('<Transition')
  })

  it('uses the reusable copy field for URL copy affordances instead of standalone copy buttons', () => {
    const applicationForm = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const settings = readProjectFile('app/pages/dashboard/jobs/[id]/settings.vue')
    const newJob = readProjectFile('app/pages/dashboard/jobs/new.vue')
    const sourceTracking = readProjectFile('app/pages/dashboard/source-tracking/[id].vue')

    expect(applicationForm).toContain('<CopyField')
    expect(settings).toContain('<CopyField')
    expect(newJob).toContain('<CopyField')
    expect(sourceTracking).toContain('<CopyField')

    expect(applicationForm).not.toContain('linkCopied')
    expect(settings).not.toContain('linkCopied')
    expect(newJob).not.toContain('linkCopiedFinal')
  })
})
