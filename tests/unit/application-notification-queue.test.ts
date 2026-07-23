import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification queue lease fencing', () => {
  it('gates delivery transitions on a successful fenced message update', () => {
    const queue = read('server/utils/applicationNotificationQueue.ts')

    expect(queue).toMatch(/const cancelled = await tx\.update\(applicationNotificationMessage\)[\s\S]+?\.returning\(\{ id: applicationNotificationMessage\.id \}\)/)
    expect(queue).toContain('if (cancelled.length === 0) return')
    expect(queue).toMatch(/const completed = await tx\.update\(applicationNotificationMessage\)[\s\S]+?\.returning\(\{ id: applicationNotificationMessage\.id \}\)/)
    expect(queue).toContain('if (completed.length === 0) return')
    expect(queue).toMatch(/const transitioned = await tx\.update\(applicationNotificationMessage\)[\s\S]+?\.returning\(\{ id: applicationNotificationMessage\.id \}\)/)
    expect(queue).toContain('if (transitioned.length === 0) return')
  })

  it('checks event lease ownership before fanout inserts', () => {
    const queue = read('server/utils/applicationNotificationQueue.ts')
    const transactionStart = queue.indexOf('await db.transaction(async (tx) => {', queue.indexOf('async function fanOutEvent'))
    const firstInsert = queue.indexOf('tx.insert(applicationNotificationMessage)', transactionStart)
    const leaseGuard = queue.indexOf('const activeLease = await tx.select', transactionStart)

    expect(transactionStart).toBeGreaterThan(-1)
    expect(leaseGuard).toBeGreaterThan(transactionStart)
    expect(leaseGuard).toBeLessThan(firstInsert)
    expect(queue.slice(leaseGuard, firstInsert)).toContain('eq(applicationNotificationEvent.id, event.id)')
    expect(queue.slice(leaseGuard, firstInsert)).toContain("eq(applicationNotificationEvent.status, 'processing')")
    expect(queue.slice(leaseGuard, firstInsert)).toContain('eq(applicationNotificationEvent.attemptCount, event.attemptCount)')
    expect(queue.slice(leaseGuard, firstInsert)).toContain("for('update')")
    expect(queue.slice(leaseGuard, firstInsert)).toContain('if (activeLease.length === 0) return')
  })
})
