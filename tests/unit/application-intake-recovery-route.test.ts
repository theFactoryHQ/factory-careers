import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(
  join(process.cwd(), 'server/api/public/jobs/[slug]/apply.post.ts'),
  'utf8',
)

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('public application recovery lifecycle', () => {
  it('buffers after basic file validation and before the first database read', () => {
    const validation = route.indexOf('validateBasicApplicationIntakeFiles')
    const buffer = route.indexOf('recoveryReceipt = await createApplicationIntakeReceipt')
    const firstDatabaseRead = route.indexOf('const organizationScope = await getPublicJobScopeCondition()')
    expect(validation).toBeGreaterThan(0)
    expect(buffer).toBeGreaterThan(validation)
    expect(firstDatabaseRead).toBeGreaterThan(buffer)
  })

  it('deletes successful and expected-invalid receipts and retains unexpected failures', () => {
    expect(route).toContain('await deleteApplicationIntakeReceipt(recoveryReceipt)')
    expect(route).toContain('isExpectedApplicationIntakeFailure(error)')
    expect(route).toContain('setResponseStatus(event, 202)')
    expect(route).toContain("delayed: true")
    expect(route).toContain('receiptId: recoveryReceipt.receiptId')
  })

  it('keeps recovery disabled for canaries and authenticated replay', () => {
    expect(route).toContain('!canaryRequested && !replayRequested')
  })

  it('keeps owner operations authenticated and metadata-only', () => {
    const operationRoutes = [
      'server/api/application-intake-recovery/index.get.ts',
      'server/api/application-intake-recovery/[receiptId].get.ts',
      'server/api/application-intake-recovery/[receiptId]/replay.post.ts',
      'server/api/application-intake-recovery/purge.post.ts',
    ].map(read)
    for (const operationRoute of operationRoutes) {
      expect(operationRoute).toContain("requirePermission(event, { organization: ['delete'] })")
    }
    expect(operationRoutes[0]).not.toContain('.envelope')
    expect(operationRoutes[1]).not.toContain('.envelope')
    expect(operationRoutes[1]).not.toContain('.fields')
  })
})
