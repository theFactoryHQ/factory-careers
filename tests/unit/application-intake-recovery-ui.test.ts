import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('delayed application confirmation', () => {
  it('preserves the delayed result and receipt when navigating to confirmation', () => {
    const apply = read('app/pages/jobs/[slug]/apply.vue')
    expect(apply).toContain('submissionResult.delayed')
    expect(apply).toContain('receiptId: submissionResult.receiptId')
  })

  it('tells the candidate not to submit again and displays the receipt', () => {
    const confirmation = read('app/pages/jobs/[slug]/confirmation.vue')
    expect(confirmation).toContain('We received your application, but processing is delayed. You do not need to submit it again.')
    expect(confirmation).toContain('Receipt ID')
  })
})
