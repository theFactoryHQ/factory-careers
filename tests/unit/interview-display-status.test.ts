import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('interview display status', () => {
  const source = readFileSync(join(process.cwd(), 'app/pages/dashboard/interviews/index.vue'), 'utf8')

  it('shows scheduled interviews in the past as a distinct display status', () => {
    expect(source).toContain("return 'scheduled_past'")
    expect(source).toContain('getInterviewDisplayStatus(interviewItem)')
    expect(source).toMatch(/getInterviewStatusLabel\(getInterviewDisplayStatus\(interviewItem\)\)/)
    expect(source).toMatch(/getInterviewStatusBadgeClass\(getInterviewDisplayStatus\(interviewItem\)\)/)
  })
})
