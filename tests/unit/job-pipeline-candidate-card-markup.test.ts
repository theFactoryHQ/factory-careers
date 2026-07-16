import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')
}

describe('job pipeline candidate card markup', () => {
  it('keeps candidate selection and email-copy controls as valid sibling buttons', () => {
    const source = readProjectFile('app/pages/dashboard/jobs/[id]/index.vue')
    const candidateList = source.match(/<!-- Scrollable list -->[\s\S]*?<!-- CENTER PANEL/)?.[0] ?? ''
    const copyControlIndex = candidateList.indexOf('<CopyEmailButton')
    const markupBeforeCopyControl = candidateList.slice(0, copyControlIndex)
    const openButtonCount = markupBeforeCopyControl.match(/<button\b/g)?.length ?? 0
    const closeButtonCount = markupBeforeCopyControl.match(/<\/button>/g)?.length ?? 0

    expect(candidateList).not.toBe('')
    expect(copyControlIndex).toBeGreaterThan(-1)
    expect(openButtonCount - closeButtonCount).toBe(0)
    expect(candidateList).toContain(':aria-label="`Open candidate ${formatPersonName(app.candidateFirstName, app.candidateLastName)}`"')
  })
})
