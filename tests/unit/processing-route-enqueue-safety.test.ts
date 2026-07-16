import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('processing enqueue route safety', () => {
  it('cancels active parse work before creating a distinct manual reparse task', () => {
    const source = read('server/api/documents/[id]/parse.post.ts')
    const cancelIndex = source.indexOf('cancelProcessingTasksInTransaction(')
    const enqueueIndex = source.indexOf('enqueueProcessingTaskInTransaction(')

    expect(cancelIndex).toBeGreaterThan(-1)
    expect(enqueueIndex).toBeGreaterThan(cancelIndex)
    expect(source).toContain('cancelled.some(task => task.id === queued.task.id)')
  })

  it('rate limits every bulk or manual processing enqueue route', () => {
    for (const path of [
      'server/api/applications/analyze-missing.post.ts',
      'server/api/jobs/[id]/analyze-all.post.ts',
      'server/api/documents/parse-all.post.ts',
      'server/api/documents/[id]/parse.post.ts',
    ]) {
      const source = read(path)
      expect(source, path).toContain('createRateLimiter({')
      expect(source, path).toContain('await limiter(event)')
    }
  })
})
